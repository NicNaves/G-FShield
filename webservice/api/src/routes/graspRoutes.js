const express = require("express");
const graspController = require("../controller/GraspController");
const { authMiddleware, anyRoleMiddleware, roleMiddleware } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * @swagger
 * /grasp/services:
 *   get:
 *     tags: [Grasp]
 *     summary: Lista os servicos GRASP-FS disponiveis
 *     description: Retorna os endpoints configurados para os microservicos DRG e DLS.
 *     responses:
 *       200:
 *         description: Servicos retornados com sucesso.
 */
router.get("/services", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res) => graspController.getServices(req, res));

/**
 * @swagger
 * /grasp/datasets:
 *   get:
 *     tags: [Grasp]
 *     summary: Lista datasets disponiveis
 *     description: Retorna os arquivos de dataset encontrados no diretorio configurado.
 *     responses:
 *       200:
 *         description: Datasets retornados com sucesso.
 */
router.get("/datasets", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res, next) => graspController.getDatasets(req, res, next));

/**
 * @swagger
 * /grasp/run:
 *   post:
 *     tags: [Grasp]
 *     summary: Inicia uma execucao GRASP-FS
 *     description: Dispara uma execucao distribuida usando algoritmos DRG e DLS configurados.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - algorithms
 *               - maxGenerations
 *               - rclCutoff
 *               - sampleSize
 *               - datasetTrainingName
 *               - datasetTestingName
 *               - classifier
 *               - neighborhoodStrategy
 *               - localSearches
 *             properties:
 *               algorithms:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["IG", "GR", "RF", "SU"]
 *               maxGenerations:
 *                 type: integer
 *                 example: 2
 *               rclCutoff:
 *                 type: integer
 *                 example: 30
 *               sampleSize:
 *                 type: integer
 *                 example: 5
 *               datasetTrainingName:
 *                 type: string
 *                 example: "ereno1ktrain.arff"
 *               datasetTestingName:
 *                 type: string
 *                 example: "ereno1ktest.arff"
 *               classifier:
 *                 type: string
 *                 example: "J48"
 *               neighborhoodMaxIterations:
 *                 type: integer
 *                 example: 10
 *               neighborhoodStrategy:
 *                 type: string
 *                 example: "VND"
 *               localSearches:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["BIT_FLIP", "IWSS", "IWSSR"]
 *               bitFlipMaxIterations:
 *                 type: integer
 *                 example: 100
 *               iwssMaxIterations:
 *                 type: integer
 *                 example: 20
 *               iwssrMaxIterations:
 *                 type: integer
 *                 example: 20
 *     responses:
 *       202:
 *         description: Execucao aceita para processamento.
 *       400:
 *         description: Parametros invalidos.
 */
router.post("/run", authMiddleware, roleMiddleware("ADMIN"), (req, res, next) => graspController.startExecution(req, res, next));

/**
 * @swagger
 * /grasp/monitor/runs:
 *   get:
 *     tags: [Grasp]
 *     summary: Lista execucoes monitoradas
 *     description: Retorna o historico recente de execucoes acompanhadas pelo monitor.
 *     responses:
 *       200:
 *         description: Lista de execucoes retornada com sucesso.
 */
router.get("/monitor/runs", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res, next) => graspController.getRuns(req, res, next));

/**
 * @swagger
 * /grasp/monitor/runs/{seedId}:
 *   get:
 *     tags: [Grasp]
 *     summary: Busca uma execucao por seedId
 *     parameters:
 *       - in: path
 *         name: seedId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Execucao encontrada.
 *       404:
 *         description: Execucao nao encontrada.
 */
router.get("/monitor/runs/:seedId", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res, next) => graspController.getRun(req, res, next));

/**
 * @swagger
 * /grasp/monitor/events:
 *   get:
 *     tags: [Grasp]
 *     summary: Lista eventos do monitor
 *     description: Retorna eventos persistidos ou em memoria associados as execucoes.
 *     responses:
 *       200:
 *         description: Eventos retornados com sucesso.
 */
router.get("/monitor/events", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res, next) => graspController.getEvents(req, res, next));

/**
 * @swagger
 * /grasp/monitor/stream:
 *   get:
 *     tags: [Grasp]
 *     summary: Abre stream de eventos em tempo real
 *     description: Mantem uma conexao Server-Sent Events para acompanhar a execucao em tempo real.
 *     responses:
 *       200:
 *         description: Stream SSE iniciada com sucesso.
 */
router.get("/monitor/stream", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res) => graspController.stream(req, res));

module.exports = router;
