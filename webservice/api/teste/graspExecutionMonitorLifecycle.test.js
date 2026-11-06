function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function consumer(run) {
  const handlers = {};
  const c = {
    events: { GROUP_JOIN:"join", CRASH:"crash", DISCONNECT:"disconnect" },
    on: jest.fn((event, fn) => { handlers[event] = fn; }),
    emit: async (event, payload = {}) => handlers[event]?.({ payload }),
    connect: jest.fn().mockResolvedValue(),
    subscribe: jest.fn().mockResolvedValue(),
    run: jest.fn(async () => { if (run) await run(c); }),
    commitOffsets: jest.fn().mockResolvedValue(),
    disconnect: jest.fn(async () => { await c.emit("disconnect"); }),
  };
  return c;
}

describe("Kafka monitor connection lifecycle", () => {
  let monitor, queue, makeKafka;
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    process.env.GRASP_MONITOR_RECONNECT_DELAY_MS = "1000";
    process.env.GRASP_MONITOR_READY_TIMEOUT_MS = "1000";
    queue = [];
    makeKafka = jest.fn(() => ({ consumer: jest.fn(() => queue.shift()) }));
    jest.doMock("kafkajs", () => ({ Kafka: makeKafka }));
    jest.doMock("../src/services/GraspExecutionStoreService", () => ({
      listRuns: jest.fn().mockResolvedValue([]), listEvents: jest.fn().mockResolvedValue([]),
      recordKafkaUpdate: jest.fn().mockResolvedValue({}),
    }));
    jest.doMock("../src/services/GraspMonitorProjectionService", () => ({
      rehydrate: jest.fn(), applyRun: jest.fn(), applyEvent: jest.fn(),
    }));
    jest.doMock("../src/utils/jsonLogger", () => ({ info:jest.fn(), warn:jest.fn(), error:jest.fn() }));
    monitor = require("../src/services/GraspExecutionMonitorService");
  });
  afterEach(async () => {
    await monitor.stop();
    jest.useRealTimers();
    delete process.env.GRASP_MONITOR_RECONNECT_DELAY_MS;
    delete process.env.GRASP_MONITOR_READY_TIMEOUT_MS;
  });

  it("does not announce readiness just because run resolves", async () => {
    const c = consumer(); queue.push(c);
    await monitor.start();
    expect(monitor.started).toBe(false);
    expect(monitor.getConnectionStatus().state).toBe("joining");
    await c.emit("join");
    expect(monitor.started).toBe(true);
    expect(monitor.readinessTimer).toBeNull();
  });

  it("recovers when CRASH occurs and run then resolves, without manual off/on", async () => {
    const failed = consumer(async c => {
      await c.emit("crash", { error:new Error("coordinator unavailable"), restart:false });
    });
    const recovered = consumer(async c => { await c.emit("join"); });
    queue.push(failed, recovered);
    await monitor.start();
    expect(monitor.started).toBe(false);
    expect(monitor.getConnectionStatus().retryScheduled).toBe(true);
    await jest.advanceTimersByTimeAsync(1000);
    expect(monitor.started).toBe(true);
    expect(makeKafka).toHaveBeenCalledTimes(2);
    expect(failed.disconnect).toHaveBeenCalledTimes(1);
  });

  it("ignores old consumer events after a new consumer becomes ready", async () => {
    const old = consumer(async c => { await c.emit("join"); });
    const fresh = consumer(async c => { await c.emit("join"); });
    queue.push(old, fresh);
    await monitor.start();
    await old.emit("crash", { error:new Error("lost connection") });
    await jest.advanceTimersByTimeAsync(1000);
    await old.emit("join");
    await old.emit("disconnect");
    await old.emit("crash", { error:new Error("stale crash") });
    expect(monitor.consumer).toBe(fresh);
    expect(monitor.started).toBe(true);
    expect(monitor.reconnectTimer).toBeNull();
  });

  it("stops while connection is pending and cannot be resurrected by late events", async () => {
    const gate = deferred();
    const c = consumer(); c.connect.mockReturnValue(gate.promise); queue.push(c);
    const start = monitor.start();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(c.connect).toHaveBeenCalled();
    await monitor.stop(); gate.resolve(); await start;
    await c.emit("join");
    expect(monitor.started).toBe(false);
    expect(c.run).not.toHaveBeenCalled();
    expect(monitor.reconnectTimer).toBeNull();
  });

  it("does not connect after stop during store rehydration", async () => {
    const gate = deferred(); monitor.rehydrateFromStore = () => gate.promise;
    const start = monitor.start(); await monitor.stop(); gate.resolve(); await start;
    expect(makeKafka).not.toHaveBeenCalled();
  });

  it("retries a connection rejection and cancels that retry on intentional stop", async () => {
    const c = consumer(); c.connect.mockRejectedValue(new Error("broker unavailable")); queue.push(c);
    await expect(monitor.start()).rejects.toThrow("broker unavailable");
    expect(monitor.getConnectionStatus().retryScheduled).toBe(true);
    await monitor.stop(); await jest.advanceTimersByTimeAsync(2000);
    expect(makeKafka).toHaveBeenCalledTimes(1);
    expect(monitor.started).toBe(false);
  });

  it("retries if the consumer never joins the group", async () => {
    const hanging = consumer(), recovered = consumer(async c => { await c.emit("join"); });
    queue.push(hanging, recovered);
    await monitor.start(); await jest.advanceTimersByTimeAsync(1000);
    expect(monitor.getConnectionStatus().state).toBe("reconnecting");
    await jest.advanceTimersByTimeAsync(1000);
    expect(monitor.started).toBe(true);
  });

  it("only constructs one consumer for simultaneous starts", async () => {
    const c=consumer(async c => { await c.emit("join"); }); queue.push(c);
    await Promise.all([monitor.start(),monitor.start(),monitor.start()]);
    expect(makeKafka).toHaveBeenCalledTimes(1);
  });

  it("defaults to retained backlog when a partition has no committed offset", async () => {
    const c=consumer(); queue.push(c); await monitor.start();
    expect(c.subscribe).toHaveBeenCalledWith(expect.objectContaining({fromBeginning:true}));
    expect(c.run.mock.calls[0][0].autoCommit).toBe(false);
  });

  it("commits the next offset only after persistence completes, without integer rounding", async () => {
    const c=consumer(); queue.push(c); await monitor.start();
    const store=require("../src/services/GraspExecutionStoreService");
    const gate=deferred(); store.recordKafkaUpdate.mockReturnValue(gate.promise);
    const handler=c.run.mock.calls[0][0].eachMessage;
    const pending=handler({topic:"BEST_SOLUTION_TOPIC",partition:2,
      message:{offset:"9007199254740993",value:Buffer.from(JSON.stringify({seedId:"durable",f1Score:95}))}});
    await Promise.resolve();
    expect(c.commitOffsets).not.toHaveBeenCalled();
    expect(monitor.getRun("durable")).toBeNull();
    gate.resolve({}); await pending;
    expect(c.commitOffsets).toHaveBeenCalledWith([{topic:"BEST_SOLUTION_TOPIC",partition:2,offset:"9007199254740994"}]);
    expect(monitor.getRun("durable")).not.toBeNull();
  });

  it("rejects storage failure without committing or exposing a successful projection", async () => {
    const c=consumer(); queue.push(c); await monitor.start();
    require("../src/services/GraspExecutionStoreService").recordKafkaUpdate.mockRejectedValue(new Error("database offline"));
    const handler=c.run.mock.calls[0][0].eachMessage;
    await expect(handler({topic:"BEST_SOLUTION_TOPIC",partition:0,
      message:{offset:"7",value:Buffer.from(JSON.stringify({seedId:"failed",f1Score:95}))}})).rejects.toThrow("database offline");
    expect(c.commitOffsets).not.toHaveBeenCalled();
    expect(monitor.getRun("failed")).toBeNull();
  });

  it("does not acknowledge malformed JSON as successfully persisted", async () => {
    const c=consumer(); queue.push(c); await monitor.start();
    await expect(c.run.mock.calls[0][0].eachMessage({topic:"BEST_SOLUTION_TOPIC",partition:0,
      message:{offset:"8",value:Buffer.from("invalid-json")}})).rejects.toThrow();
    expect(c.commitOffsets).not.toHaveBeenCalled();
  });
});
