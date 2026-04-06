const fs = require("fs");
const path = require("path");
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerOptions = require("../swaggerOptions");

const outputPath = path.join(__dirname, "..", "swagger.generated.json");
const spec = swaggerJSDoc(swaggerOptions);

fs.writeFileSync(outputPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
console.log(`Swagger spec generated at ${outputPath}`);
