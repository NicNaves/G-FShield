const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("../swaggerConfig");
const { mockDataEnabled } = require("./config/runtimeConfig");

const userRoutes = require("./routes/userRoutes");
const graspRoutes = require("./routes/graspRoutes");
const mockRoutes = require("./routes/mockRoutes");

const app = express();

app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  })
);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use("/api/grasp", graspRoutes);
if (mockDataEnabled) {
  app.use("/api", mockRoutes);
}
app.use("/api", userRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Rota nao encontrada." });
});

app.use((err, req, res, next) => {
  console.error("Erro no servidor:", err);
  res.status(err.status || 500).json({ error: err.message || "Erro interno do servidor." });
});

module.exports = app;
