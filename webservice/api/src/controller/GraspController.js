const graspGatewayService = require("../services/GraspGatewayService");
const graspExecutionMonitorService = require("../services/GraspExecutionMonitorService");
const graspExecutionStoreService = require("../services/GraspExecutionStoreService");
const datasetCatalogService = require("../services/DatasetCatalogService");
const executionQueueService = require("../services/ExecutionQueueService");
const environmentResetService = require("../services/EnvironmentResetService");
const { MONITOR_SCHEMA_VERSION, graspMonitorSummaryService } = require("../services/GraspMonitorSummaryService");

class GraspController {
  buildEnvelope(payload = {}) {
    return {
      schemaVersion: MONITOR_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      ...payload,
    };
  }

  isProgressTopic(topic) {
    return topic === "LOCAL_SEARCH_PROGRESS_TOPIC";
  }

  topicPriority(topic) {
    if (topic === "BEST_SOLUTION_TOPIC") {
      return 2;
    }

    if (topic === "SOLUTIONS_TOPIC") {
      return 2;
    }

    if (topic === "LOCAL_SEARCH_PROGRESS_TOPIC") {
      return 1;
    }

    return 0;
  }

  shouldPreferCandidateRun(currentRun, candidateRun) {
    if (!currentRun) {
      return true;
    }

    const currentPriority = this.topicPriority(currentRun.topic);
    const candidatePriority = this.topicPriority(candidateRun.topic);
    if (candidatePriority !== currentPriority) {
      return candidatePriority > currentPriority;
    }

    const currentScore = Number(currentRun.bestF1Score ?? Number.NEGATIVE_INFINITY);
    const candidateScore = Number(candidateRun.bestF1Score ?? Number.NEGATIVE_INFINITY);
    if (candidateScore !== currentScore) {
      return candidateScore > currentScore;
    }

    return new Date(candidateRun.updatedAt || 0) >= new Date(currentRun.updatedAt || 0);
  }

  mergeRuns(storedRuns = [], liveRuns = []) {
    const runs = new Map();

    for (const run of storedRuns) {
      runs.set(run.seedId, run);
    }

    for (const run of liveRuns) {
      const current = runs.get(run.seedId) || {};
      const preferredRun = this.shouldPreferCandidateRun(current, run) ? run : current;
      runs.set(run.seedId, {
        ...current,
        ...preferredRun,
        history:
          (run.history?.length || 0) >= (current.history?.length || 0)
            ? run.history || []
            : current.history || [],
      });
    }

    return [...runs.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  mergeEvents(storedEvents = [], liveEvents = [], limit = 100) {
    const merged = new Map();

    [...liveEvents, ...storedEvents]
      .forEach((event) => {
        if (!event) {
          return;
        }

        const key = event.fingerprint
          || event.requestId
          || `${event.type || "event"}:${event.topic || "topic"}:${event.seedId || "seed"}:${event.timestamp}`;

        if (!merged.has(key)) {
          merged.set(key, event);
        }
      });

    return [...merged.values()]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  normalizeSeedIds(seedIds) {
    const values = Array.isArray(seedIds)
      ? seedIds
      : typeof seedIds === "string"
        ? seedIds.split(",")
        : [];

    return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
  }

  async loadMergedRun(seedId, historyLimit = Number(process.env.GRASP_RUN_HISTORY_LIMIT || 2000)) {
    const liveRun = graspExecutionMonitorService.getRun(seedId);
    const storedRun = await graspExecutionStoreService.getRun(seedId, historyLimit);
    return liveRun
      ? this.mergeRuns(storedRun ? [storedRun] : [], [liveRun])[0]
      : storedRun;
  }

  buildRunComparison(runs = []) {
    const validRuns = runs.filter(Boolean);
    const scores = validRuns
      .map((run) => Number(run.bestF1Score ?? run.currentF1Score))
      .filter((value) => Number.isFinite(value));
    const bestRun = validRuns.reduce((best, run) => {
      if (!best) {
        return run;
      }

      return Number(run.bestF1Score ?? run.currentF1Score ?? Number.NEGATIVE_INFINITY)
        > Number(best.bestF1Score ?? best.currentF1Score ?? Number.NEGATIVE_INFINITY)
        ? run
        : best;
    }, null);
    const featureSets = validRuns.map((run) =>
      new Set((Array.isArray(run.solutionFeatures) ? run.solutionFeatures : []).map((feature) => String(feature)))
    );
    const sharedFeatures = featureSets.length === 0
      ? []
      : [...featureSets.reduce((shared, nextSet) => {
        if (!shared) {
          return new Set(nextSet);
        }

        return new Set([...shared].filter((feature) => nextSet.has(feature)));
      }, null)];

    return {
      comparedCount: validRuns.length,
      bestRun: bestRun
        ? {
            seedId: bestRun.seedId,
            rclAlgorithm: bestRun.rclAlgorithm,
            bestF1Score: bestRun.bestF1Score ?? bestRun.currentF1Score,
          }
        : null,
      scoreSpread: scores.length > 0 ? Math.max(...scores) - Math.min(...scores) : 0,
      sharedFeatureCount: sharedFeatures.length,
      sharedFeatures: sharedFeatures.slice(0, 24),
      sameDatasetPair:
        new Set(validRuns.map((run) => `${run.trainingFileName || "--"}|${run.testingFileName || "--"}`)).size <= 1,
      algorithms: [...new Set(validRuns.map((run) => run.rclAlgorithm).filter(Boolean))],
      neighborhoods: [...new Set(validRuns.map((run) => run.neighborhood).filter(Boolean))],
      localSearches: [...new Set(validRuns.map((run) => run.localSearch).filter(Boolean))],
    };
  }

  async startExecution(req, res, next) {
    try {
      const payload = { ...req.body };
      if (Object.keys(payload).length === 0) {
        Object.assign(payload, req.query);
      }

      const launch = await executionQueueService.enqueueExecution(payload, req.user);

      res.status(202).json(this.buildEnvelope({
        message: "Execution queued successfully.",
        launch,
      }));
    } catch (error) {
      next(error);
    }
  }

  async getExecutionLaunches(req, res, next) {
    try {
      const launches = await executionQueueService.listLaunches(Number(req.query.limit || 50));
      res.json(this.buildEnvelope({ launches }));
    } catch (error) {
      next(error);
    }
  }

  async getExecutionLaunch(req, res, next) {
    try {
      const launch = await executionQueueService.getLaunch(req.params.requestId);
      if (!launch) {
        return res.status(404).json({ error: "Execution launch not found." });
      }

      return res.json(this.buildEnvelope({ launch }));
    } catch (error) {
      next(error);
    }
  }

  async cancelExecution(req, res, next) {
    try {
      const launch = await executionQueueService.cancelExecution(req.params.requestId);
      res.json(this.buildEnvelope({
        message: "Execution cancellation processed.",
        launch,
      }));
    } catch (error) {
      next(error);
    }
  }

  getServices(req, res) {
    res.json({
      services: graspGatewayService.getServices(),
    });
  }

  async getDatasets(req, res, next) {
    try {
      const catalog = await datasetCatalogService.getCatalog();
      res.json(catalog);
    } catch (error) {
      next(error);
    }
  }

  async getRuns(req, res, next) {
    try {
      const liveRuns = graspExecutionMonitorService.getRuns();
      const storedRuns = await graspExecutionStoreService.listRuns(
        Number(req.query.limit || 100),
        Number(req.query.historyLimit || process.env.GRASP_RUN_SUMMARY_HISTORY_LIMIT || 30)
      );
      const runs = this.mergeRuns(storedRuns, liveRuns);

      res.json(this.buildEnvelope({ runs }));
    } catch (error) {
      next(error);
    }
  }

  async getRun(req, res, next) {
    try {
      const run = await this.loadMergedRun(
        req.params.seedId,
        Number(req.query.historyLimit || process.env.GRASP_RUN_HISTORY_LIMIT || 2000)
      );

      if (!run) {
        return res.status(404).json({ error: "Execucao nao encontrada." });
      }

      return res.json(this.buildEnvelope({ run }).run);
    } catch (error) {
      next(error);
    }
  }

  async compareRuns(req, res, next) {
    try {
      const seedIds = this.normalizeSeedIds(req.query.seedIds || req.body?.seedIds);
      if (seedIds.length < 2) {
        return res.status(400).json({ error: "Select at least two seedIds to compare." });
      }

      const runs = (
        await Promise.all(
          seedIds.map((seedId) =>
            this.loadMergedRun(seedId, Number(req.query.historyLimit || process.env.GRASP_RUN_SUMMARY_HISTORY_LIMIT || 50))
          )
        )
      ).filter(Boolean);

      res.json(this.buildEnvelope({
        comparison: this.buildRunComparison(runs),
        runs,
      }));
    } catch (error) {
      next(error);
    }
  }

  async getEvents(req, res, next) {
    try {
      const limit = Number(req.query.limit || 500);
      const liveEvents = graspExecutionMonitorService.getEvents(limit);
      const storedEvents = await graspExecutionStoreService.listEvents(limit);
      const events = this.mergeEvents(storedEvents, liveEvents, limit);

      res.json(this.buildEnvelope({ events }));
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req, res, next) {
    try {
      const runLimit = Number(req.query.runLimit || 300);
      const eventLimit = Number(req.query.eventLimit || 300);
      const historyLimit = Number(req.query.historyLimit || process.env.GRASP_RUN_SUMMARY_HISTORY_LIMIT || 30);
      const liveRuns = graspExecutionMonitorService.getRuns();
      const storedRuns = await graspExecutionStoreService.listRuns(runLimit, historyLimit);
      const liveEvents = graspExecutionMonitorService.getEvents(eventLimit);
      const storedEvents = await graspExecutionStoreService.listEvents(eventLimit);
      const runs = this.mergeRuns(storedRuns, liveRuns);
      const events = this.mergeEvents(storedEvents, liveEvents, eventLimit);
      const summary = graspMonitorSummaryService.summarize(runs, events);

      res.json(this.buildEnvelope({ summary }));
    } catch (error) {
      next(error);
    }
  }

  async resetMonitor(req, res, next) {
    try {
      graspExecutionMonitorService.reset();
      await executionQueueService.reset();
      await graspExecutionStoreService.resetMonitorState();
      res.json(this.buildEnvelope({
        message: "Monitor state reset successfully.",
        summary: graspMonitorSummaryService.summarize([], []),
      }));
    } catch (error) {
      next(error);
    }
  }

  async resetEnvironment(req, res, next) {
    try {
      const result = await environmentResetService.resetEnvironment();
      res.json(this.buildEnvelope({
        message: "Distributed environment reset successfully.",
        reset: result,
        summary: graspMonitorSummaryService.summarize([], []),
      }));
    } catch (error) {
      next(error);
    }
  }

  stream(req, res) {
    const close = graspExecutionMonitorService.registerClient(res);
    req.on("close", close);
  }
}

module.exports = new GraspController();
