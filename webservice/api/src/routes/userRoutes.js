const express = require("express");
const UserController = require("../controller/UserController");
const { authMiddleware, roleMiddleware } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @swagger
 * /register:
 *   post:
 *     tags: [Auth]
 *     summary: Cria uma nova conta de usuario
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Usuario criado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserSummary'
 *       400:
 *         description: Payload invalido ou e-mail ja utilizado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/register", UserController.registrar);

/**
 * @swagger
 * /login:
 *   post:
 *     tags: [Auth]
 *     summary: Autentica o usuario
 *     description: |
 *       Valida as credenciais, retorna um JWT para clientes programaticos
 *       e tambem emite uma sessao HTTP-only em cookie para o frontend web.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login efetuado com sucesso.
 *         headers:
 *           Set-Cookie:
 *             description: Cookie HTTP-only com a sessao autenticada.
 *             schema:
 *               type: string
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Requisicao invalida.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Credenciais invalidas.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Usuario inativo.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/login", UserController.login);

/**
 * @swagger
 * /logout:
 *   post:
 *     tags: [Auth]
 *     summary: Encerra a sessao autenticada
 *     responses:
 *       200:
 *         description: Sessao encerrada com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LogoutResponse'
 */
router.post("/logout", UserController.logout);

/**
 * @swagger
 * /me:
 *   get:
 *     tags: [Auth]
 *     summary: Retorna o usuario autenticado
 *     responses:
 *       200:
 *         description: Resumo do usuario autenticado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserSummary'
 *       401:
 *         description: Sessao ausente, invalida ou expirada.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/me", authMiddleware, UserController.me);

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Lista todos os usuarios
 *     responses:
 *       200:
 *         description: Lista retornada com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/UserSummary'
 *       401:
 *         description: Nao autenticado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Requer papel ADMIN.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/users", authMiddleware, roleMiddleware("ADMIN"), UserController.buscarTodosUsuarios);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Busca um usuario por ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Usuario encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserSummary'
 *       404:
 *         description: Usuario nao encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/users/:id", authMiddleware, roleMiddleware("ADMIN"), UserController.buscarUsuarioPorId);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Atualiza um usuario
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Joao Silva"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "joao@gfshield.local"
 *               telefone:
 *                 type: string
 *                 example: "11987654321"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 6
 *                 example: "NovaSenha123"
 *               role:
 *                 type: string
 *                 enum: [ADMIN, VIEWER]
 *               active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Usuario atualizado com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserSummary'
 *       400:
 *         description: Dados invalidos.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Usuario nao encontrado.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/users/:id", authMiddleware, roleMiddleware("ADMIN"), UserController.atualizarUsuario);

module.exports = router;
