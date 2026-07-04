require("dotenv").config();
require("./utils/applyKafkaJsPatch")();

const app = require("./app");
const prisma = require("./lib/prisma");
const graspExecutionMonitorService = require("./services/GraspExecutionMonitorService");
const executionQueueService = require("./services/ExecutionQueueService");
const { authDisabled, mockDataEnabled } = require("./config/runtimeConfig");

const PORT = process.env.API_PORT || 3000;
const DATABASE_READY_RETRIES = Number(process.env.DATABASE_READY_RETRIES || 30);
const DATABASE_READY_DELAY_MS = Number(process.env.DATABASE_READY_DELAY_MS || 2000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDatabase() {
  let lastError = null;

  for (let attempt = 1; attempt <= DATABASE_READY_RETRIES; attempt += 1) {
    try {
      await prisma.$connect();
      return;
    } catch (error) {
      lastError = error;
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(),
        level: "WARN",
        service: "webservice-api",
        message: "Aguardando banco de dados ficar pronto",
        attempt,
        retries: DATABASE_READY_RETRIES,
        error: error.message,
      }));

      if (attempt < DATABASE_READY_RETRIES) {
        await sleep(DATABASE_READY_DELAY_MS);
      }
    }
  }

  throw lastError || new Error("Banco de dados indisponivel");
}

(async () => {
  try {
    await waitForDatabase();
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      service: "webservice-api",
      message: "Falha ao conectar no banco de dados",
      error: error.message,
    }));
    process.exit(1);
  }

  try {
    await graspExecutionMonitorService.start();
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      service: "webservice-api",
      message: "Falha ao iniciar monitor Kafka",
      error: error.message,
    }));
  }

  try {
    await executionQueueService.start();
  } catch (error) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "ERROR",
      service: "webservice-api",
      message: "Falha ao iniciar fila de execucao",
      error: error.message,
    }));
  }

  app.listen(PORT, () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "INFO",
      service: "webservice-api",
      message: "Servidor rodando",
      port: PORT,
      swagger: `http://localhost:${PORT}/api-docs`,
      authDisabled,
      mockDataEnabled,
    }));
  });
})();
