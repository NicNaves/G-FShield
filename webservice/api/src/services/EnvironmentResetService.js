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
    this.refreshConfiguration();
  }

  refreshConfiguration() {
    this.projectRoot = process.env.GF_SHIELD_PROJECT_ROOT
      ? path.resolve(process.env.GF_SHIELD_PROJECT_ROOT)
      : path.resolve(__dirname, "../../../..");
    this.metricsDir = process.env.GF_SHIELD_METRICS_DIR
      ? path.resolve(process.env.GF_SHIELD_METRICS_DIR)
      : path.join(this.projectRoot, "metrics");
    this.dockerCommand = process.env.GF_SHIELD_DOCKER_BIN || "docker";
    this.composeProjectName = String(process.env.GF_SHIELD_COMPOSE_PROJECT_NAME || "").trim();
    this.composeFiles = this.parseComposeFiles(process.env.GF_SHIELD_COMPOSE_FILES);
  }

  parseComposeFiles(value = "") {
    return String(value || "")
      .split(/[,\r\n;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  buildComposeArgs(...commandArgs) {
    const args = ["compose"];

    if (this.composeProjectName) {
      args.push("-p", this.composeProjectName);
    }

    for (const composeFile of this.composeFiles) {
      args.push("-f", composeFile);
    }

    return [...args, ...commandArgs];
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
    this.refreshConfiguration();

    const startedAt = new Date().toISOString();
    const steps = [];
    let runtimeInterrupted = false;

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
      runtimeInterrupted = true;

      await this.runStep(steps, "docker.compose.down", async () =>
        this.runCommand(this.dockerCommand, this.buildComposeArgs("down", "--remove-orphans"), {
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
        this.runCommand(this.dockerCommand, this.buildComposeArgs("up", "-d", "--force-recreate", "--remove-orphans"), {
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
      if (runtimeInterrupted) {
        await this.restoreRuntimeStateAfterFailure(steps);
      }

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

  async restoreRuntimeStateAfterFailure(steps) {
    await this.runBestEffortStep(steps, "monitor.consumer.recover", async () => {
      await this.retry(async () => {
        await graspExecutionMonitorService.start();
      }, 5, 2000);

      return { started: true };
    });

    await this.runBestEffortStep(steps, "queue.recover", async () => {
      await executionQueueService.start();
      return { started: true };
    });
  }

  async runBestEffortStep(steps, name, action) {
    try {
      await this.runStep(steps, name, action);
    } catch (error) {
      logger.warn("Best-effort recovery step failed", {
        step: name,
        error: error.message,
      });
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
