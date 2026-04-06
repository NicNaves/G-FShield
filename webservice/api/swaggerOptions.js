const { AUTH_COOKIE_NAME } = require("./src/utils/authSession");

const apiServerUrl = process.env.SWAGGER_SERVER_URL || "http://localhost:4000/api";

module.exports = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "GF-Shield Webservice API",
      version: "1.1.0",
      description: [
        "API do gateway, autenticacao e monitoramento do GF-Shield.",
        "",
        "Seguranca:",
        "- Senhas sao armazenadas com bcrypt no backend.",
        `- O login emite sessao HTTP-only em cookie (${AUTH_COOKIE_NAME}) e tambem pode retornar JWT para clientes programaticos.`,
        "- Em producao, publique a API atras de HTTPS.",
      ].join("\n"),
    },
    servers: [
      {
        url: apiServerUrl,
        description: "Servidor local",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Use o token JWT retornado pelo endpoint /login.",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: AUTH_COOKIE_NAME,
          description: "Sessao HTTP-only usada pelo frontend web.",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          properties: {
            error: {
              type: "string",
              example: "Credenciais invalidas.",
            },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: {
              type: "string",
              format: "email",
              example: "admin@gfshield.local",
            },
            password: {
              type: "string",
              format: "password",
              example: "SenhaSegura123",
            },
          },
        },
        LoginResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "Login bem-sucedido.",
            },
            token: {
              type: "string",
              description: "JWT para clientes nao baseados em navegador.",
            },
            role: {
              type: "string",
              enum: ["ADMIN", "VIEWER"],
              example: "ADMIN",
            },
            userId: {
              type: "integer",
              example: 1,
            },
            expiresInMs: {
              type: "integer",
              example: 86400000,
            },
          },
        },
        LogoutResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "Sessao encerrada com sucesso.",
            },
          },
        },
        UserSummary: {
          type: "object",
          properties: {
            id: { type: "integer", example: 1 },
            name: { type: "string", example: "Admin GF-Shield" },
            email: { type: "string", format: "email", example: "admin@gfshield.local" },
            cpf: { type: "string", nullable: true, example: "12345678901" },
            telefone: { type: "string", nullable: true, example: "11999998888" },
            role: { type: "string", enum: ["ADMIN", "VIEWER"], example: "ADMIN" },
            active: { type: "boolean", example: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["name", "email", "password"],
          properties: {
            name: { type: "string", example: "Maria Silva" },
            email: { type: "string", format: "email", example: "maria@gfshield.local" },
            cpf: { type: "string", example: "12345678901" },
            telefone: { type: "string", example: "11987654321" },
            password: { type: "string", format: "password", minLength: 6, example: "SenhaSegura123" },
            role: { type: "string", enum: ["ADMIN", "VIEWER"], example: "VIEWER" },
          },
        },
      },
    },
    security: [
      { cookieAuth: [] },
      { bearerAuth: [] },
    ],
    tags: [
      {
        name: "Auth",
        description: "Autenticacao, sessao e perfil do usuario autenticado.",
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
