const swaggerJSDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "GF-Shield Webservice API",
      version: "1.0.0",
      description: "Documentacao da API do gateway e monitoramento do GF-Shield.",
    },
    servers: [
      {
        url: "http://localhost:4000/api",
      },
    ],
    tags: [
      {
        name: "Auth",
        description: "Autenticacao e sessao de usuarios.",
      },
      {
        name: "Users",
        description: "Gestao de usuarios do webservice.",
      },
      {
        name: "Grasp",
        description: "Gateway, catalogo e monitoramento das execucoes GRASP-FS.",
      },
    ],
  },
  apis: ["./src/routes/userRoutes.js", "./src/routes/graspRoutes.js"],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
