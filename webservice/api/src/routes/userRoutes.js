const express = require("express");
const UserController = require("../controller/UserController");
const { authMiddleware, roleMiddleware } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @swagger
 * /register:
 *   post:
 *     tags: [Auth]
 *     summary: Registra um novo usuario
 *     description: Cria uma nova conta de usuario.
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
 *                 example: "joao@example.com"
 *               cpf:
 *                 type: string
 *                 example: "12345678901"
 *               telefone:
 *                 type: string
 *                 example: "11987654321"
 *               password:
 *                 type: string
 *                 example: "senha123"
 *               role:
 *                 type: string
 *                 example: "VIEWER"
 *     responses:
 *       201:
 *         description: Usuario registrado com sucesso.
 *       400:
 *         description: Erro ao registrar usuario.
 */
router.post("/register", UserController.registrar);

/**
 * @swagger
 * /login:
 *   post:
 *     tags: [Auth]
 *     summary: Realiza login de um usuario
 *     description: Autentica um usuario e retorna um token JWT.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: "joao@example.com"
 *               password:
 *                 type: string
 *                 example: "senha123"
 *     responses:
 *       200:
 *         description: Login bem-sucedido.
 *       401:
 *         description: Credenciais invalidas.
 */
router.post("/login", UserController.login);

/**
 * @swagger
 * /me:
 *   get:
 *     tags: [Auth]
 *     summary: Retorna o usuario autenticado
 *     responses:
 *       200:
 *         description: Usuario autenticado retornado com sucesso.
 *       401:
 *         description: Token invalido ou ausente.
 */
router.get("/me", authMiddleware, UserController.me);

/**
 * @swagger
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: Lista todos os usuarios
 *     description: Retorna uma lista com todos os usuarios cadastrados.
 *     responses:
 *       200:
 *         description: Lista de usuarios retornada com sucesso.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 */
router.get("/users", authMiddleware, roleMiddleware("ADMIN"), UserController.buscarTodosUsuarios);

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Busca um usuario por ID
 *     description: Retorna os dados de um usuario especifico.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Usuario encontrado com sucesso.
 *       404:
 *         description: Usuario nao encontrado.
 */
router.get("/users/:id", authMiddleware, roleMiddleware("ADMIN"), UserController.buscarUsuarioPorId);

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Atualiza os dados de um usuario
 *     description: Atualiza os dados de um usuario especifico pelo ID.
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
 *                 example: "joao@example.com"
 *               telefone:
 *                 type: string
 *                 example: "11987654321"
 *               role:
 *                 type: string
 *                 example: "VIEWER"
 *               active:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Usuario atualizado com sucesso.
 *       404:
 *         description: Usuario nao encontrado.
 */
router.put("/users/:id", authMiddleware, roleMiddleware("ADMIN"), UserController.atualizarUsuario);

module.exports = router;
