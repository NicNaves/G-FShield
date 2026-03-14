require("dotenv").config();

const app = require("./app");
const graspExecutionMonitorService = require("./services/GraspExecutionMonitorService");
const executionQueueService = require("./services/ExecutionQueueService");
const { authDisabled, mockDataEnabled } = require("./config/runtimeConfig");

const PORT = process.env.API_PORT || 3000;

(async () => {
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
