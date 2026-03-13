const graspGatewayService = require("../services/GraspGatewayService");
const graspExecutionMonitorService = require("../services/GraspExecutionMonitorService");
const graspExecutionStoreService = require("../services/GraspExecutionStoreService");
const datasetCatalogService = require("../services/DatasetCatalogService");

class GraspController {
  isProgressTopic(topic) {
    return topic === "LOCAL_SEARCH_PROGRESS_TOPIC";
  }

  topicPriority(topic) {
    if (topic === "BEST_SOLUTION_TOPIC") {
      return 3;
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
      .filter((event) => !this.isProgressTopic(event?.topic))
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

  async startExecution(req, res, next) {
    try {
      const payload = { ...req.body };
      if (Object.keys(payload).length === 0) {
        Object.assign(payload, req.query);
      }

      const result = await graspGatewayService.startExecution(payload);
      graspExecutionMonitorService.recordGatewayDispatch(result);

      res.status(202).json({
        message: "Execucao disparada com sucesso.",
        ...result,
      });
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

      res.json({
        runs: this.mergeRuns(storedRuns, liveRuns),
      });
    } catch (error) {
      next(error);
    }
  }

  async getRun(req, res, next) {
    try {
      const liveRun = graspExecutionMonitorService.getRun(req.params.seedId);
      const historyLimit = Number(req.query.historyLimit || process.env.GRASP_RUN_HISTORY_LIMIT || 2000);
      const storedRun = await graspExecutionStoreService.getRun(req.params.seedId, historyLimit);
      const run = liveRun
        ? this.mergeRuns(storedRun ? [storedRun] : [], [liveRun])[0]
        : storedRun;

      if (!run) {
        return res.status(404).json({ error: "Execucao nao encontrada." });
      }

      return res.json(run);
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

      res.json({
        events,
      });
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
