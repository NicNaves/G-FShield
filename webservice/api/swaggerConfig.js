const fs = require("fs");
const path = require("path");

const staticSpecPath = path.join(__dirname, "swagger.generated.json");

if (String(process.env.SWAGGER_FORCE_RUNTIME_BUILD || "false").toLowerCase() !== "true" && fs.existsSync(staticSpecPath)) {
  module.exports = JSON.parse(fs.readFileSync(staticSpecPath, "utf8"));
} else {
  const swaggerJSDoc = require("swagger-jsdoc");
  const swaggerOptions = require("./swaggerOptions");
  module.exports = swaggerJSDoc(swaggerOptions);
}
