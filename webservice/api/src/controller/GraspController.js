const graspGatewayService = require("../services/GraspGatewayService");
const graspExecutionMonitorService = require("../services/GraspExecutionMonitorService");
const graspExecutionStoreService = require("../services/GraspExecutionStoreService");
const datasetCatalogService = require("../services/DatasetCatalogService");
const executionQueueService = require("../services/ExecutionQueueService");
const environmentResetService = require("../services/EnvironmentResetService");
const appCacheService = require("../services/AppCacheService");
const graspDashboardAggregateService = require("../services/GraspDashboardAggregateService");
const graspMonitorFeedService = require("../services/GraspMonitorFeedService");
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

  resolveCacheTtlMs(kind = "default") {
    const specificTtls = {
      runs: Number(process.env.GRASP_RUNS_CACHE_TTL_MS || 2500),
      run: Number(process.env.GRASP_RUN_CACHE_TTL_MS || 4000),
      events: Number(process.env.GRASP_EVENTS_CACHE_TTL_MS || 2500),
      summary: Number(process.env.GRASP_SUMMARY_CACHE_TTL_MS || 4000),
      launch: Number(process.env.GRASP_LAUNCH_CACHE_TTL_MS || 5000),
      compare: Number(process.env.GRASP_COMPARE_CACHE_TTL_MS || 5000),
      bootstrap: Number(process.env.GRASP_BOOTSTRAP_CACHE_TTL_MS || 2500),
      projection: Number(process.env.GRASP_PROJECTION_CACHE_TTL_MS || 2500),
      dashboard: Number(process.env.GRASP_DASHBOARD_CACHE_TTL_MS || 5000),
      feed: Number(process.env.GRASP_FEED_CACHE_TTL_MS || 2500),
    };

    return Math.max(specificTtls[kind] || Number(process.env.API_CACHE_TTL_MS || 5000), 250);
  }

  async buildMonitorBootstrap({ runLimit = 100, eventLimit = 300, historyLimit = 30 } = {}) {
    if (graspExecutionMonitorService.canServeWindow({ runLimit, eventLimit, historyLimit })) {
      const projection = graspExecutionMonitorService.getProjection();
      return {
        runs: graspExecutionMonitorService.getRuns(runLimit),
        events: graspExecutionMonitorService.getEvents(eventLimit),
        summary: projection.summary,
        projection,
      };
    }

    const liveRuns = graspExecutionMonitorService.getRuns();
    const storedRuns = await graspExecutionStoreService.listRuns(runLimit, historyLimit);
    const liveEvents = graspExecutionMonitorService.getEvents(eventLimit);
    const storedEvents = await graspExecutionStoreService.listEvents(eventLimit);
    const runs = this.mergeRuns(storedRuns, liveRuns);
    const events = this.mergeEvents(storedEvents, liveEvents, eventLimit);
    const summary = graspMonitorSummaryService.summarize(runs, events);

    return {
      runs,
      events,
      summary,
      projection: graspExecutionMonitorService.getProjection(),
    };
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
      await appCacheService.clear();

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
      const options = {
        includeMonitor: String(req.query.includeMonitor || "false").toLowerCase() === "true",
        historyLimit: Number(req.query.historyLimit || process.env.GRASP_RUN_HISTORY_LIMIT || 2000),
        eventLimit: Number(req.query.eventLimit || process.env.GRASP_EVENT_EXPORT_LIMIT || 5000),
      };
      const cacheKey = appCacheService.buildKey("execution-launch", {
        requestId: req.params.requestId,
        ...options,
      });
      const launch = await appCacheService.remember(
        cacheKey,
        () => executionQueueService.getLaunch(req.params.requestId, options),
        this.resolveCacheTtlMs("launch")
      );
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
      await appCacheService.clear();
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
      const options = {
        limit: Number(req.query.limit || 100),
        historyLimit: Number(req.query.historyLimit || process.env.GRASP_RUN_SUMMARY_HISTORY_LIMIT || 30),
      };
      const cacheKey = appCacheService.buildKey("monitor-runs", options);
      const runs = await appCacheService.remember(
        cacheKey,
        async () => {
          if (graspExecutionMonitorService.canServeWindow({
            runLimit: options.limit,
            eventLimit: 0,
            historyLimit: options.historyLimit,
          })) {
            return graspExecutionMonitorService.getRuns(options.limit);
          }

          const liveRuns = graspExecutionMonitorService.getRuns();
          const storedRuns = await graspExecutionStoreService.listRuns(options.limit, options.historyLimit);
          return this.mergeRuns(storedRuns, liveRuns);
        },
        this.resolveCacheTtlMs("runs")
      );

      res.json(this.buildEnvelope({ runs }));
    } catch (error) {
      next(error);
    }
  }

  async getRun(req, res, next) {
    try {
      const historyLimit = Number(req.query.historyLimit || process.env.GRASP_RUN_HISTORY_LIMIT || 2000);
      const cacheKey = appCacheService.buildKey("monitor-run", {
        seedId: req.params.seedId,
        historyLimit,
      });
      const run = await appCacheService.remember(
        cacheKey,
        () => this.loadMergedRun(req.params.seedId, historyLimit),
        this.resolveCacheTtlMs("run")
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

      const historyLimit = Number(req.query.historyLimit || process.env.GRASP_RUN_SUMMARY_HISTORY_LIMIT || 50);
      const cacheKey = appCacheService.buildKey("monitor-compare", {
        seedIds,
        historyLimit,
      });
      const runs = await appCacheService.remember(
        cacheKey,
        async () => (
          await Promise.all(
            seedIds.map((seedId) => this.loadMergedRun(seedId, historyLimit))
          )
        ).filter(Boolean),
        this.resolveCacheTtlMs("compare")
      );

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
      const cacheKey = appCacheService.buildKey("monitor-events", { limit });
      const events = await appCacheService.remember(
        cacheKey,
        async () => {
          if (graspExecutionMonitorService.canServeWindow({
            runLimit: 0,
            eventLimit: limit,
            historyLimit: 0,
          })) {
            return graspExecutionMonitorService.getEvents(limit);
          }

          const liveEvents = graspExecutionMonitorService.getEvents(limit);
          const storedEvents = await graspExecutionStoreService.listEvents(limit);
          return this.mergeEvents(storedEvents, liveEvents, limit);
        },
        this.resolveCacheTtlMs("events")
      );

      res.json(this.buildEnvelope({ events }));
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req, res, next) {
    try {
      const options = {
        runLimit: Number(req.query.runLimit || 300),
        eventLimit: Number(req.query.eventLimit || 300),
        historyLimit: Number(req.query.historyLimit || process.env.GRASP_RUN_SUMMARY_HISTORY_LIMIT || 30),
      };
      const cacheKey = appCacheService.buildKey("monitor-summary", options);
      const summary = await appCacheService.remember(
        cacheKey,
        async () => {
          if (graspExecutionMonitorService.canServeWindow(options)) {
            return graspExecutionMonitorService.getSummary();
          }

          const bootstrap = await this.buildMonitorBootstrap(options);
          return bootstrap.summary;
        },
        this.resolveCacheTtlMs("summary")
      );

      res.json(this.buildEnvelope({ summary }));
    } catch (error) {
      next(error);
    }
  }

  async getBootstrap(req, res, next) {
    try {
      const options = {
        runLimit: Number(req.query.limit || 100),
        eventLimit: Number(req.query.eventLimit || 300),
        historyLimit: Number(req.query.historyLimit || process.env.GRASP_RUN_SUMMARY_HISTORY_LIMIT || 30),
      };
      const cacheKey = appCacheService.buildKey("monitor-bootstrap", options);
      const bootstrap = await appCacheService.remember(
        cacheKey,
        () => this.buildMonitorBootstrap(options),
        this.resolveCacheTtlMs("bootstrap")
      );

      res.json(this.buildEnvelope(bootstrap));
    } catch (error) {
      next(error);
    }
  }

  async getProjection(req, res, next) {
    try {
      const cacheKey = appCacheService.buildKey("monitor-projection", {
        bucketLimit: Number(req.query.bucketLimit || 72),
      });
      const projection = await appCacheService.remember(
        cacheKey,
        () => graspExecutionMonitorService.getProjection({
          bucketLimit: Number(req.query.bucketLimit || 72),
        }),
        this.resolveCacheTtlMs("projection")
      );

      res.json(this.buildEnvelope({ projection }));
    } catch (error) {
      next(error);
    }
  }

  async getFeed(req, res, next) {
    try {
      const options = {
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || process.env.GRASP_FEED_PAGE_SIZE || 25),
        topics: req.query.topics || "",
        algorithm: req.query.algorithm || "",
        datasetKey: req.query.datasetKey || "",
        status: req.query.status || "",
        searchLabel: req.query.searchLabel || "",
        requestId: req.query.requestId || "",
        seedId: req.query.seedId || "",
        start: req.query.start || "",
        end: req.query.end || "",
        query: req.query.query || "",
      };
      const cacheKey = appCacheService.buildKey("monitor-feed", options);
      const feed = await appCacheService.remember(
        cacheKey,
        () => graspMonitorFeedService.listFeed(options),
        this.resolveCacheTtlMs("feed")
      );

      res.json(this.buildEnvelope({ feed }));
    } catch (error) {
      next(error);
    }
  }

  async getDashboardAggregate(req, res, next) {
    try {
      const options = {
        bucketLimit: Number(req.query.bucketLimit || process.env.GRASP_DASHBOARD_BUCKET_LIMIT || 72),
      };
      const cacheKey = appCacheService.buildKey("monitor-dashboard-v3", options);
      const dashboard = await appCacheService.remember(
        cacheKey,
        () => graspDashboardAggregateService.getDashboardAggregate(options),
        this.resolveCacheTtlMs("dashboard")
      );

      res.json(this.buildEnvelope({ dashboard }));
    } catch (error) {
      next(error);
    }
  }

  async resetMonitor(req, res, next) {
    try {
      graspExecutionMonitorService.reset();
      await executionQueueService.reset();
      await graspExecutionStoreService.resetMonitorState();
      await graspDashboardAggregateService.clearReadModel();
      await appCacheService.clear();
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
      await graspDashboardAggregateService.clearReadModel();
      await appCacheService.clear();
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
