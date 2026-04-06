const express = require("express");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("../swaggerConfig");
const { mockDataEnabled } = require("./config/runtimeConfig");

const userRoutes = require("./routes/userRoutes");
const graspRoutes = require("./routes/graspRoutes");
const mockRoutes = require("./routes/mockRoutes");

const app = express();

const allowedOrigins = String(
  process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000,http://localhost:4000,http://localhost:4173,http://127.0.0.1:4173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origem nao autorizada pelo CORS."));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
};

app.disable("x-powered-by");
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "1mb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");

  if (String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
});
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  swaggerOptions: {
    persistAuthorization: false,
  },
}));

app.use("/api/grasp", graspRoutes);
if (mockDataEnabled) {
  app.use("/api", mockRoutes);
}
app.use("/api", userRoutes);

app.use((req, res) => {
  res.status(404).json({ error: "Rota nao encontrada." });
});

app.use((err, req, res, next) => {
  console.error("Erro no servidor:", err.message || err);
  const statusCode = err.message === "Origem nao autorizada pelo CORS." ? 403 : (err.status || 500);
  res.status(statusCode).json({ error: err.message || "Erro interno do servidor." });
});

module.exports = app;
