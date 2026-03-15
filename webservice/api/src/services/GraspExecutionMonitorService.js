const { Kafka } = require("kafkajs");
const { kafkaBrokers, monitorTopics } = require("../config/graspFsConfig");
const graspExecutionStoreService = require("./GraspExecutionStoreService");
const { MONITOR_SCHEMA_VERSION, graspMonitorSummaryService } = require("./GraspMonitorSummaryService");
const logger = require("../utils/jsonLogger");

class GraspExecutionMonitorService {
  constructor() {
    this.kafka = null;
    this.consumer = null;
    this.started = false;
    this.startPromise = null;
    this.clients = new Set();
    this.runs = new Map();
    this.events = [];
    this.historyLimit = Math.max(Number(process.env.GRASP_MONITOR_HISTORY_LIMIT || 500), 1);
    this.eventLimit = Math.max(Number(process.env.GRASP_MONITOR_EVENT_LIMIT || 300), 1);
    this.persistProgressEvents = String(process.env.GRASP_PERSIST_PROGRESS_EVENTS || "true").toLowerCase() === "true";
    this.exposeProgressEvents = String(process.env.GRASP_EXPOSE_PROGRESS_EVENTS || "true").toLowerCase() === "true";
  }

  isProgressTopic(topic) {
    return topic === "LOCAL_SEARCH_PROGRESS_TOPIC";
  }

  isTerminalRun(topic, payload = {}, currentRun = null) {
    if (topic !== "SOLUTIONS_TOPIC") {
      return false;
    }

    const neighborhood = String(payload.neighborhood || currentRun?.neighborhood || "").trim().toUpperCase();
    const iterationNeighborhood = this.numberOrNull(
      payload.iterationNeighborhood ?? currentRun?.iterationNeighborhood ?? null,
    );

    if (!Number.isFinite(iterationNeighborhood)) {
      return false;
    }

    if (neighborhood === "VND") {
      return iterationNeighborhood >= this.resolveVndDispatchBudget(payload, currentRun);
    }

    if (neighborhood === "RVND") {
      return iterationNeighborhood >= this.resolveNeighborhoodCycles(payload, currentRun);
    }

    return false;
  }

  resolveVndDispatchBudget(payload = {}, currentRun = null) {
    const enabledLocalSearches = this.resolveEnabledLocalSearches(payload, currentRun);
    const searchesPerCycle = Math.max(enabledLocalSearches.length, 1);
    const configuredCycles = this.resolveNeighborhoodCycles(payload, currentRun);
    return Math.max(configuredCycles * searchesPerCycle, searchesPerCycle);
  }

  resolveNeighborhoodCycles(payload = {}, currentRun = null) {
    const configuredCycles = this.numberOrNull(
      payload.neighborhoodMaxIterations ?? currentRun?.neighborhoodMaxIterations ?? null,
    );

    return configuredCycles && configuredCycles > 0 ? configuredCycles : 1;
  }

  resolveEnabledLocalSearches(payload = {}, currentRun = null) {
    const configured = this.cloneList(
      payload.enabledLocalSearches,
      currentRun?.enabledLocalSearches || ["BIT_FLIP", "IWSS", "IWSSR"],
    );

    const normalized = configured
      .map((entry) => String(entry || "").trim().toUpperCase())
      .filter(Boolean);

    return normalized.length ? [...new Set(normalized)] : ["BIT_FLIP", "IWSS", "IWSSR"];
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

    const currentScore = this.numberOrNull(currentRun.bestF1Score) ?? Number.NEGATIVE_INFINITY;
    const candidateScore = this.numberOrNull(candidateRun.bestF1Score) ?? Number.NEGATIVE_INFINITY;
    if (candidateScore !== currentScore) {
      return candidateScore > currentScore;
    }

    return new Date(candidateRun.updatedAt || 0) >= new Date(currentRun.updatedAt || 0);
  }

  mergeRuns(storedRuns = [], liveRuns = []) {
    const runs = new Map();

    for (const run of storedRuns) {
      if (run?.seedId) {
        runs.set(run.seedId, run);
      }
    }

    for (const run of liveRuns) {
      if (!run?.seedId) {
        continue;
      }

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

    [...liveEvents, ...storedEvents].forEach((event) => {
      if (!event) {
        return;
      }

      const key = event.fingerprint
        || event.requestId
        || `${event.type || "event"}:${event.topic || "topic"}:${event.seedId || "seed"}:${event.timestamp || "time"}`;

      if (!merged.has(key)) {
        merged.set(key, event);
      }
    });

    return [...merged.values()]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  async start() {
    if (this.started) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.connect();
    return this.startPromise;
  }

  async stop() {
    const activeConsumer = this.consumer;

    this.started = false;
    this.startPromise = null;
    this.consumer = null;
    this.kafka = null;

    if (!activeConsumer) {
      return;
    }

    try {
      await activeConsumer.disconnect();
      logger.info("Monitor Kafka interrompido");
    } catch (error) {
      logger.warn("Falha ao interromper monitor Kafka", {
        error: error.message,
      });
    }
  }

  async connect() {
    try {
      this.kafka = new Kafka({
        clientId: process.env.KAFKA_CLIENT_ID || "grasp-fs-monitor",
        brokers: kafkaBrokers,
      });

      this.consumer = this.kafka.consumer({
        groupId: process.env.KAFKA_MONITOR_GROUP_ID || "grasp-fs-monitor-group",
      });

      this.consumer.on(this.consumer.events.CRASH, async (event) => {
        const error = event.payload?.error;
        logger.error("Consumer do monitor Kafka sofreu crash", {
          error: error?.message || "Erro desconhecido",
          groupId: event.payload?.groupId || null,
          restart: event.payload?.restart ?? null,
        });
      });

      await this.consumer.connect();

      const fromBeginning = String(process.env.KAFKA_MONITOR_FROM_BEGINNING || "false").toLowerCase() === "true";

      for (const topic of monitorTopics) {
        await this.consumer.subscribe({ topic, fromBeginning });
      }

      await this.consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          if (!message.value) {
            return;
          }

          try {
            const payload = JSON.parse(message.value.toString());
            this.recordKafkaMessage(topic, payload, {
              partition,
              offset: message.offset,
            });
          } catch (error) {
            logger.error("Falha ao processar mensagem do Kafka", {
              topic,
              error: error.message,
            });
          }
        },
      });

      this.started = true;
      this.startPromise = null;
      logger.info("Monitor Kafka iniciado", { brokers: kafkaBrokers, topics: monitorTopics, fromBeginning });
    } catch (error) {
      logger.error("Falha ao iniciar monitor Kafka", { error: error.message, brokers: kafkaBrokers });
      this.startPromise = null;
      throw error;
    }
  }

  recordGatewayDispatch(dispatchResult) {
    const event = this.pushEvent({
      type: "gateway.dispatch",
      requestId: dispatchResult.requestId || null,
      topic: "API_GATEWAY",
      seedId: null,
      status: "requested",
      requestedAt: dispatchResult.requestedAt,
      algorithms: dispatchResult.algorithms,
      params: dispatchResult.params,
      executions: dispatchResult.executions.map((execution) => ({
        algorithm: execution.algorithm,
        url: execution.url,
        status: execution.status,
        })),
    });

    graspExecutionStoreService.recordGatewayDispatch(dispatchResult).catch((error) => {
      logger.error("Falha ao persistir disparo do gateway", {
        requestId: dispatchResult.requestId,
        error: error.message,
      });
    });

    return event;
  }

  recordKafkaMessage(topic, payload, source = {}) {
    const seedId = payload.seedId ? String(payload.seedId) : `unknown-${Date.now()}`;
    const now = new Date().toISOString();
    const stage = this.resolveStage(topic, payload);
    const eventType = topic === "LOCAL_SEARCH_PROGRESS_TOPIC" ? "kafka.progress" : "kafka.update";

    const current = this.runs.get(seedId) || {
      seedId,
      createdAt: now,
      bestF1Score: null,
      history: [],
      updates: 0,
    };
    const terminalRun = this.isTerminalRun(topic, payload, current);
    const status = terminalRun ? "completed" : "running";

    const incomingF1 = this.numberOrNull(payload.f1Score);
    const previousBestF1Score = this.numberOrNull(current.bestF1Score);
    const scoreDelta = incomingF1 === null || previousBestF1Score === null
      ? null
      : incomingF1 - previousBestF1Score;
    const improved = incomingF1 !== null && (previousBestF1Score === null || incomingF1 > previousBestF1Score);
    const solutionFeatures = this.cloneList(payload.solutionFeatures, current.solutionFeatures);
    const rclFeatures = this.cloneList(payload.rclfeatures || payload.rclFeatures, current.rclfeatures || current.rclFeatures);
    const enabledLocalSearches = this.cloneList(payload.enabledLocalSearches, current.enabledLocalSearches);
    const solutionSize = solutionFeatures.length;
    const rclSize = rclFeatures.length;
    const historyEntry = {
      timestamp: now,
      stage,
      topic,
      eventType,
      f1Score: incomingF1,
      previousBestF1Score,
      scoreDelta,
      improved,
      cpuUsage: this.numberOrNull(payload.cpuUsage),
      memoryUsage: this.numberOrNull(payload.memoryUsage),
      memoryUsagePercent: this.numberOrNull(payload.memoryUsagePercent),
      localSearch: payload.localSearch || null,
      neighborhood: payload.neighborhood || null,
      iterationNeighborhood: payload.iterationNeighborhood ?? null,
      iterationLocalSearch: payload.iterationLocalSearch ?? null,
      solutionSize,
      rclSize,
      solutionFeatures,
      rclFeatures,
      enabledLocalSearches,
    };
    const shouldTrackProgress = !this.isProgressTopic(topic) || this.exposeProgressEvents;
    const nextBestF1 = incomingF1 === null
      ? current.bestF1Score
      : Math.max(current.bestF1Score ?? Number.NEGATIVE_INFINITY, incomingF1);
    const hasCompletedSnapshot = String(current.status || "").toLowerCase() === "completed";
    const preserveCompletedSnapshot = hasCompletedSnapshot && !terminalRun;
    const preserveTerminalSnapshot = preserveCompletedSnapshot;

    const run = {
      ...current,
      seedId,
      updatedAt: now,
      completedAt: preserveTerminalSnapshot
        ? current.completedAt || now
        : (terminalRun ? now : current.completedAt || null),
      status: preserveTerminalSnapshot ? current.status || "completed" : status,
      stage: preserveTerminalSnapshot ? current.stage || "best_solution" : stage,
      topic: preserveTerminalSnapshot ? current.topic || topic : topic,
      rclAlgorithm: payload.rclAlgorithm || current.rclAlgorithm || null,
      classifier: payload.classifier || payload.classfier || current.classifier || null,
      localSearch: preserveTerminalSnapshot
        ? current.localSearch || payload.localSearch || null
        : (payload.localSearch || current.localSearch || null),
      neighborhood: preserveTerminalSnapshot
        ? current.neighborhood || payload.neighborhood || null
        : (payload.neighborhood || current.neighborhood || null),
      trainingFileName: payload.trainingFileName || current.trainingFileName || null,
      testingFileName: payload.testingFileName || current.testingFileName || null,
      enabledLocalSearches: preserveTerminalSnapshot
        ? current.enabledLocalSearches || enabledLocalSearches
        : enabledLocalSearches,
      neighborhoodMaxIterations: preserveTerminalSnapshot
        ? current.neighborhoodMaxIterations ?? payload.neighborhoodMaxIterations ?? null
        : (payload.neighborhoodMaxIterations ?? current.neighborhoodMaxIterations ?? null),
      bitFlipMaxIterations: preserveTerminalSnapshot
        ? current.bitFlipMaxIterations ?? payload.bitFlipMaxIterations ?? null
        : (payload.bitFlipMaxIterations ?? current.bitFlipMaxIterations ?? null),
      iwssMaxIterations: preserveTerminalSnapshot
        ? current.iwssMaxIterations ?? payload.iwssMaxIterations ?? null
        : (payload.iwssMaxIterations ?? current.iwssMaxIterations ?? null),
      iwssrMaxIterations: preserveTerminalSnapshot
        ? current.iwssrMaxIterations ?? payload.iwssrMaxIterations ?? null
        : (payload.iwssrMaxIterations ?? current.iwssrMaxIterations ?? null),
      iterationNeighborhood: preserveTerminalSnapshot
        ? current.iterationNeighborhood ?? payload.iterationNeighborhood ?? null
        : (payload.iterationNeighborhood ?? current.iterationNeighborhood ?? null),
      iterationLocalSearch: preserveTerminalSnapshot
        ? current.iterationLocalSearch ?? payload.iterationLocalSearch ?? null
        : (payload.iterationLocalSearch ?? current.iterationLocalSearch ?? null),
      currentF1Score: preserveTerminalSnapshot ? current.currentF1Score ?? incomingF1 : incomingF1,
      bestF1Score: Number.isFinite(nextBestF1) ? nextBestF1 : current.bestF1Score,
      accuracy: preserveTerminalSnapshot
        ? current.accuracy ?? this.numberOrNull(payload.accuracy)
        : this.numberOrNull(payload.accuracy),
      precision: preserveTerminalSnapshot
        ? current.precision ?? this.numberOrNull(payload.precision)
        : this.numberOrNull(payload.precision),
      recall: preserveTerminalSnapshot
        ? current.recall ?? this.numberOrNull(payload.recall)
        : this.numberOrNull(payload.recall),
      cpuUsage: this.numberOrNull(payload.cpuUsage),
      memoryUsage: this.numberOrNull(payload.memoryUsage),
      memoryUsagePercent: this.numberOrNull(payload.memoryUsagePercent),
      runnigTime: preserveTerminalSnapshot
        ? current.runnigTime ?? payload.runnigTime ?? null
        : (payload.runnigTime ?? current.runnigTime ?? null),
      solutionFeatures: preserveTerminalSnapshot
        ? current.solutionFeatures || solutionFeatures
        : solutionFeatures,
      solutionSize,
      rclfeatures: preserveTerminalSnapshot
        ? current.rclfeatures || rclFeatures
        : rclFeatures,
      rclFeatures: preserveTerminalSnapshot
        ? current.rclFeatures || rclFeatures
        : rclFeatures,
      rclSize,
      previousBestF1Score: preserveTerminalSnapshot
        ? current.previousBestF1Score ?? previousBestF1Score
        : previousBestF1Score,
      scoreDelta: preserveTerminalSnapshot
        ? current.scoreDelta ?? scoreDelta
        : scoreDelta,
      improved: preserveTerminalSnapshot
        ? current.improved ?? improved
        : improved,
      updates: current.updates + 1,
      history: shouldTrackProgress
        ? [...current.history, historyEntry].slice(-this.historyLimit)
        : current.history,
    };

    this.runs.set(seedId, run);
    const { history, ...runWithoutHistory } = run;

    const event = {
      schemaVersion: MONITOR_SCHEMA_VERSION,
      type: eventType,
      fingerprint: `${topic}:${source.partition ?? "na"}:${source.offset ?? now}`,
      seedId,
      topic,
      stage,
      status,
      sourcePartition: source.partition ?? null,
      sourceOffset: source.offset ?? null,
      payload: {
        ...runWithoutHistory,
        historyEntry,
      },
    };

    if (!this.isProgressTopic(topic) || this.exposeProgressEvents) {
      this.pushEvent(event);
    }

    if (eventType !== "kafka.progress" || this.persistProgressEvents) {
      graspExecutionStoreService.recordKafkaUpdate(event).catch((error) => {
        logger.error("Falha ao persistir update do Kafka", {
          topic,
          seedId,
          error: error.message,
        });
      });
    }
  }

  resolveStage(topic, payload) {
    if (topic === "INITIAL_SOLUTION_TOPIC") {
      return "initial_solution";
    }

    if (topic === "NEIGHBORHOOD_RESTART_TOPIC") {
      return "neighborhood_restart";
    }

    if (topic === "LOCAL_SEARCH_PROGRESS_TOPIC") {
      if (payload.localSearch) {
        return String(payload.localSearch).toLowerCase();
      }
      return "local_search_progress";
    }

    if (topic === "BEST_SOLUTION_TOPIC") {
      return "best_solution";
    }

    if (payload.localSearch) {
      return String(payload.localSearch).toLowerCase();
    }

    return "solution_update";
  }

  numberOrNull(value) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  cloneList(value, fallback = []) {
    if (Array.isArray(value)) {
      return [...value];
    }

    if (Array.isArray(fallback)) {
      return [...fallback];
    }

    return [];
  }

  pushEvent(event) {
    const enriched = {
      timestamp: new Date().toISOString(),
      schemaVersion: MONITOR_SCHEMA_VERSION,
      ...event,
    };

    this.events.unshift(enriched);
    this.events = this.events.slice(0, this.eventLimit);
    this.broadcast(enriched);
    return enriched;
  }

  broadcast(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      client.write(payload);
    }
  }

  registerClient(res) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    this.clients.add(res);
    this.sendSnapshotToClient(res).catch((error) => {
      logger.warn("Falha ao montar snapshot SSE completo", { error: error.message });
      const fallbackSnapshot = {
        type: "snapshot",
        runs: this.getRuns(),
        events: this.getEvents(50),
      };
      res.write(`data: ${JSON.stringify(fallbackSnapshot)}\n\n`);
    });

    return () => {
      this.clients.delete(res);
      res.end();
    };
  }

  async sendSnapshotToClient(res) {
    const snapshotLimit = Number(process.env.GRASP_MONITOR_SNAPSHOT_LIMIT || 200);
    const eventLimit = Number(process.env.GRASP_MONITOR_SNAPSHOT_EVENT_LIMIT || 200);
    const [storedRuns, storedEvents] = await Promise.all([
      graspExecutionStoreService.listRuns(snapshotLimit),
      graspExecutionStoreService.listEvents(eventLimit),
    ]);

    const snapshot = {
      schemaVersion: MONITOR_SCHEMA_VERSION,
      type: "snapshot",
      runs: this.mergeRuns(storedRuns, this.getRuns()),
      events: this.mergeEvents(storedEvents, this.getEvents(eventLimit), eventLimit),
    };
    snapshot.summary = graspMonitorSummaryService.summarize(snapshot.runs, snapshot.events);

    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
  }

  getRuns() {
    return [...this.runs.values()].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  getRun(seedId) {
    return this.runs.get(seedId) || null;
  }

  getEvents(limit = 100) {
    return this.events.slice(0, limit);
  }

  reset() {
    this.runs.clear();
    this.events = [];
    this.broadcast({
      schemaVersion: MONITOR_SCHEMA_VERSION,
      type: "snapshot",
      runs: [],
      events: [],
      summary: graspMonitorSummaryService.summarize([], []),
    });
  }
}

module.exports = new GraspExecutionMonitorService();
