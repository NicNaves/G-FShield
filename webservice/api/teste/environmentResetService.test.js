const { EventEmitter } = require("events");

const originalEnv = { ...process.env };

const mockDependencies = () => {
  jest.doMock("../src/services/ExecutionQueueService", () => ({
    reset: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
  }));

  jest.doMock("../src/services/GraspExecutionMonitorService", () => ({
    reset: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
  }));

  jest.doMock("../src/services/GraspExecutionStoreService", () => ({
    resetMonitorState: jest.fn().mockResolvedValue(undefined),
  }));

  jest.doMock("../src/utils/jsonLogger", () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }));

  jest.doMock("fs/promises", () => ({
    readdir: jest.fn().mockResolvedValue([]),
    unlink: jest.fn().mockResolvedValue(undefined),
  }));
};

const createSpawnMock = (outcomes = []) => {
  return jest.fn((command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = jest.fn();

    const outcome = outcomes.shift() || { code: 0 };
    process.nextTick(() => {
      if (outcome.stdout) {
        child.stdout.emit("data", Buffer.from(outcome.stdout));
      }

      if (outcome.stderr) {
        child.stderr.emit("data", Buffer.from(outcome.stderr));
      }

      child.emit("close", outcome.code ?? 0);
    });

    return child;
  });
};

describe("EnvironmentResetService", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("uses the configured docker compose project and files during reset", async () => {
    process.env.GF_SHIELD_PROJECT_ROOT = "/tmp/g-fshield";
    process.env.GF_SHIELD_DOCKER_BIN = "/usr/local/bin/docker";
    process.env.GF_SHIELD_COMPOSE_PROJECT_NAME = "g-fshield";
    process.env.GF_SHIELD_COMPOSE_FILES = "docker-compose.yml,docker-compose.server.yml";

    mockDependencies();
    const spawnMock = createSpawnMock([{ code: 0 }, { code: 0 }]);
    jest.doMock("child_process", () => ({ spawn: spawnMock }));

    const service = require("../src/services/EnvironmentResetService");

    const result = await service.resetEnvironment();

    expect(result.status).toBe("completed");
    expect(spawnMock).toHaveBeenNthCalledWith(
      1,
      "/usr/local/bin/docker",
      [
        "compose",
        "-p",
        "g-fshield",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.server.yml",
        "down",
        "--remove-orphans",
      ],
      expect.objectContaining({
        cwd: expect.any(String),
        env: process.env,
        windowsHide: true,
      }),
    );
    expect(spawnMock).toHaveBeenNthCalledWith(
      2,
      "/usr/local/bin/docker",
      [
        "compose",
        "-p",
        "g-fshield",
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.server.yml",
        "up",
        "-d",
        "--force-recreate",
        "--remove-orphans",
      ],
      expect.objectContaining({
        cwd: expect.any(String),
        env: process.env,
        windowsHide: true,
      }),
    );
  });

  test("tries to recover the monitor and queue after a compose failure", async () => {
    mockDependencies();
    const spawnMock = createSpawnMock([{ code: 1, stderr: "docker failed" }]);
    jest.doMock("child_process", () => ({ spawn: spawnMock }));

    const service = require("../src/services/EnvironmentResetService");
    const executionQueueService = require("../src/services/ExecutionQueueService");
    const graspExecutionMonitorService = require("../src/services/GraspExecutionMonitorService");

    await expect(service.resetEnvironment()).rejects.toThrow("docker failed");

    expect(graspExecutionMonitorService.start).toHaveBeenCalledTimes(1);
    expect(executionQueueService.start).toHaveBeenCalledTimes(1);
  });
});
