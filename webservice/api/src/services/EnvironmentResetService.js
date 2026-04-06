const fs = require("fs/promises");
const http = require("http");
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

  getComposeFileBaseNames() {
    return this.composeFiles
      .map((composeFile) => path.posix.basename(String(composeFile).replace(/\\/g, "/")))
      .sort();
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

      const composeDownState = await this.tryComposeDown(steps);

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

      if (composeDownState.strategy === "compose") {
        await this.runStep(steps, "docker.compose.up", async () =>
          this.runCommand(this.dockerCommand, this.buildComposeArgs("up", "-d", "--force-recreate", "--remove-orphans"), {
            cwd: this.projectRoot,
            timeoutMs: 10 * 60 * 1000,
          })
        );
      } else {
        await this.runStep(steps, "docker.api.restart", async () =>
          this.restartComposeContainersViaSocket()
        );
      }

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

  async tryComposeDown(steps) {
    try {
      const result = await this.runStep(steps, "docker.compose.down", async () =>
        this.runCommand(this.dockerCommand, this.buildComposeArgs("down", "--remove-orphans"), {
          cwd: this.projectRoot,
          timeoutMs: 10 * 60 * 1000,
        })
      );

      return {
        strategy: "compose",
        result,
      };
    } catch (error) {
      if (!this.shouldUseDockerApiFallback(error)) {
        throw error;
      }

      const latestStep = steps[steps.length - 1];
      if (latestStep?.name === "docker.compose.down" && latestStep?.status === "failed") {
        latestStep.status = "skipped";
        latestStep.details = {
          strategy: "docker-api-restart",
          reason: error.message,
        };
        delete latestStep.error;
      }

      logger.warn("Docker CLI unavailable for environment reset; falling back to Docker socket restart", {
        error: error.message,
        dockerCommand: this.dockerCommand,
      });

      return {
        strategy: "docker-api-restart",
        error,
      };
    }
  }

  shouldUseDockerApiFallback(error) {
    const message = String(error?.message || "");
    const errorCode = String(error?.code || "");
    return errorCode === "ENOENT"
      || message.includes("ENOENT")
      || message.includes("spawn /usr/local/bin/docker")
      || message.includes("spawn docker");
  }

  async restartComposeContainersViaSocket() {
    const containers = await this.listComposeContainersViaSocket();
    if (!containers.length) {
      throw new Error("No compose containers matched the configured project for reset.");
    }

    const restartedServices = [];
    for (const container of containers) {
      await this.requestDockerApi("POST", `/containers/${container.Id}/restart?t=30`);
      restartedServices.push(container.Labels?.["com.docker.compose.service"] || container.Names?.[0] || container.Id);
    }

    return {
      strategy: "docker-api-restart",
      restartedCount: restartedServices.length,
      restartedServices,
    };
  }

  async listComposeContainersViaSocket() {
    const containers = await this.requestDockerApi("GET", "/containers/json?all=1");
    const configuredFileBaseNames = this.getComposeFileBaseNames();

    const matched = (Array.isArray(containers) ? containers : [])
      .filter((container) => {
        const labels = container?.Labels || {};
        const composeProject = labels["com.docker.compose.project"] || "";
        if (composeProject !== this.composeProjectName) {
          return false;
        }

        const configFiles = String(labels["com.docker.compose.project.config_files"] || "")
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((entry) => path.posix.basename(entry.replace(/\\/g, "/")))
          .sort();

        if (!configuredFileBaseNames.length) {
          return true;
        }

        return configuredFileBaseNames.join(",") === configFiles.join(",");
      })
      .sort((left, right) => this.compareComposeContainers(left, right));

    return matched;
  }

  compareComposeContainers(left, right) {
    const priority = new Map([
      ["zookeeper", 0],
      ["kafka", 1],
      ["grasp-fs.dls.verify", 2],
      ["grasp-fs-dls-bf", 3],
      ["grasp-fs-dls-iw", 4],
      ["grasp-fs-dls-iwr", 5],
      ["grasp-fs-dls-rvnd", 6],
      ["grasp-fs-dls-vnd", 7],
      ["grasp-fs-rcl-gr", 8],
      ["grasp-fs-rcl-ig", 9],
      ["grasp-fs-rcl-rf", 10],
      ["grasp-fs-rcl-su", 11],
      ["kafbat-ui", 12],
    ]);

    const leftService = left?.Labels?.["com.docker.compose.service"] || "";
    const rightService = right?.Labels?.["com.docker.compose.service"] || "";
    const leftPriority = priority.has(leftService) ? priority.get(leftService) : 100;
    const rightPriority = priority.has(rightService) ? priority.get(rightService) : 100;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return leftService.localeCompare(rightService);
  }

  requestDockerApi(method, requestPath, payload = null) {
    return new Promise((resolve, reject) => {
      const socketPath = process.env.DOCKER_SOCK || "/var/run/docker.sock";
      const body = payload ? JSON.stringify(payload) : null;
      const request = http.request(
        {
          socketPath,
          path: requestPath,
          method,
          headers: body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : undefined,
        },
        (response) => {
          let rawData = "";

          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            rawData += chunk;
          });
          response.on("end", () => {
            if (response.statusCode >= 400) {
              reject(new Error(`Docker API ${method} ${requestPath} failed with status ${response.statusCode}: ${rawData}`));
              return;
            }

            if (!rawData.trim()) {
              resolve(null);
              return;
            }

            try {
              resolve(JSON.parse(rawData));
            } catch (error) {
              resolve(rawData);
            }
          });
        }
      );

      request.on("error", reject);

      if (body) {
        request.write(body);
      }

      request.end();
    });
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
