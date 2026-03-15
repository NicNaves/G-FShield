const fs = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const executionQueueService = require("./ExecutionQueueService");
const graspExecutionMonitorService = require("./GraspExecutionMonitorService");
const graspExecutionStoreService = require("./GraspExecutionStoreService");
const logger = require("../utils/jsonLogger");

class EnvironmentResetService {
  constructor() {
    this.activeReset = null;
    this.lastResult = null;
    this.projectRoot = path.resolve(__dirname, "../../../..");
    this.metricsDir = path.join(this.projectRoot, "metrics");
  }

  async resetEnvironment() {
    if (this.activeReset) {
      const error = new Error("Environment reset already in progress.");
      error.status = 409;
      throw error;
    }

    this.activeReset = this.runReset();

    try {
      return await this.activeReset;
    } finally {
      this.activeReset = null;
    }
  }

  async runReset() {
    const startedAt = new Date().toISOString();
    const steps = [];

    try {
      await this.runStep(steps, "queue.reset", async () => {
        await executionQueueService.reset();
        return { cleared: true };
      });

      await this.runStep(steps, "monitor.memory.reset", async () => {
        graspExecutionMonitorService.reset();
        return { cleared: true };
      });

      await this.runStep(steps, "monitor.consumer.stop", async () => {
        await graspExecutionMonitorService.stop();
        return { stopped: true };
      });

      await this.runStep(steps, "docker.compose.down", async () =>
        this.runCommand("docker", ["compose", "down", "--remove-orphans"], {
          cwd: this.projectRoot,
          timeoutMs: 10 * 60 * 1000,
        })
      );

      const metricsCleanup = await this.runStep(steps, "metrics.cleanup", async () => {
        const removedFiles = await this.clearMetricsFiles();
        return {
          removedFiles,
          removedCount: removedFiles.length,
        };
      });

      await this.runStep(steps, "monitor.store.reset", async () => {
        await graspExecutionStoreService.resetMonitorState();
        return { cleared: true };
      });

      await this.runStep(steps, "docker.compose.up", async () =>
        this.runCommand("docker", ["compose", "up", "-d", "--force-recreate", "--remove-orphans"], {
          cwd: this.projectRoot,
          timeoutMs: 10 * 60 * 1000,
        })
      );

      await this.runStep(steps, "monitor.consumer.restart", async () => {
        await this.retry(async () => {
          await graspExecutionMonitorService.start();
        }, 15, 2000);

        return { started: true };
      });

      await this.runStep(steps, "queue.restart", async () => {
        await executionQueueService.start();
        return { started: true };
      });

      const result = {
        status: "completed",
        startedAt,
        finishedAt: new Date().toISOString(),
        metricsRemoved: metricsCleanup.removedFiles || [],
        steps,
      };

      this.lastResult = result;
      logger.info("Environment reset completed", {
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        stepCount: result.steps.length,
        metricsRemoved: result.metricsRemoved.length,
      });

      return result;
    } catch (error) {
      const failure = {
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        error: error.message,
        steps,
      };

      this.lastResult = failure;
      logger.error("Environment reset failed", {
        error: error.message,
        startedAt: failure.startedAt,
        finishedAt: failure.finishedAt,
        stepCount: failure.steps.length,
      });

      throw error;
    }
  }

  async runStep(steps, name, action) {
    const startedAt = new Date().toISOString();
    const startedAtMs = Date.now();

    try {
      const details = await action();
      const step = {
        name,
        status: "completed",
        startedAt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAtMs,
        ...(details && typeof details === "object" ? { details } : {}),
      };
      steps.push(step);
      return details || null;
    } catch (error) {
      steps.push({
        name,
        status: "failed",
        startedAt,
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - startedAtMs,
        error: error.message,
      });
      throw error;
    }
  }

  async clearMetricsFiles() {
    try {
      const files = await fs.readdir(this.metricsDir, { withFileTypes: true });
      const removableFiles = files
        .filter((entry) => entry.isFile() && entry.name.endsWith("_METRICS.csv"))
        .map((entry) => entry.name);

      await Promise.all(removableFiles.map((fileName) =>
        fs.unlink(path.join(this.metricsDir, fileName))
      ));

      return removableFiles;
    } catch (error) {
      if (error.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  async retry(action, attempts, delayMs) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await action();
      } catch (error) {
        lastError = error;

        if (attempt >= attempts) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd || this.projectRoot,
        env: process.env,
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      const timeoutMs = Number(options.timeoutMs || 0);
      let timer = null;

      const appendOutput = (current, chunk) => {
        const next = `${current}${chunk}`;
        return next.length > 12000 ? next.slice(-12000) : next;
      };

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          child.kill();
          reject(new Error(`Command timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`));
        }, timeoutMs);
      }

      child.stdout.on("data", (chunk) => {
        stdout = appendOutput(stdout, chunk.toString());
      });

      child.stderr.on("data", (chunk) => {
        stderr = appendOutput(stderr, chunk.toString());
      });

      child.on("error", (error) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(error);
      });

      child.on("close", (code) => {
        if (timer) {
          clearTimeout(timer);
        }

        if (code !== 0) {
          const message = stderr.trim() || stdout.trim() || `Command exited with code ${code}`;
          reject(new Error(message));
          return;
        }

        resolve({
          command: `${command} ${args.join(" ")}`,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      });
    });
  }
}

module.exports = new EnvironmentResetService();
