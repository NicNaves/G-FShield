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
 *               useTrainingCache:
 *                 type: boolean
 *                 description: Reaproveita em memoria o dataset de treino dentro de cada microservico para acelerar novas execucoes com o mesmo arquivo.
 *                 example: true
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

router.get("/executions", authMiddleware, roleMiddleware("ADMIN"), (req, res, next) => graspController.getExecutionLaunches(req, res, next));

router.get("/executions/:requestId", authMiddleware, roleMiddleware("ADMIN"), (req, res, next) => graspController.getExecutionLaunch(req, res, next));

router.post("/executions/:requestId/cancel", authMiddleware, roleMiddleware("ADMIN"), (req, res, next) => graspController.cancelExecution(req, res, next));

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

router.get("/monitor/bootstrap", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res, next) => graspController.getBootstrap(req, res, next));
router.get("/monitor/projection", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res, next) => graspController.getProjection(req, res, next));
router.get("/monitor/feed", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res, next) => graspController.getFeed(req, res, next));
router.get("/monitor/dashboard", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res, next) => graspController.getDashboardAggregate(req, res, next));

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

router.get("/monitor/compare", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res, next) => graspController.compareRuns(req, res, next));

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
 * /grasp/monitor/summary:
 *   get:
 *     tags: [Grasp]
 *     summary: Retorna metricas agregadas do monitor
 *     description: Consolida execucoes, topicos, etapas e medias por algoritmo para o dashboard.
 *     responses:
 *       200:
 *         description: Resumo do monitor retornado com sucesso.
 */
router.get("/monitor/summary", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res, next) => graspController.getSummary(req, res, next));

/**
 * @swagger
 * /grasp/monitor/reset:
 *   post:
 *     tags: [Grasp]
 *     summary: Limpa o estado do monitor
 *     description: Remove o estado em memoria e os registros persistidos do monitor para um novo ciclo de validacao.
 *     responses:
 *       200:
 *         description: Estado do monitor limpo com sucesso.
 */
router.post("/monitor/reset", authMiddleware, roleMiddleware("ADMIN"), (req, res, next) => graspController.resetMonitor(req, res, next));

/**
 * @swagger
 * /grasp/environment/reset:
 *   post:
 *     tags: [Grasp]
 *     summary: Reinicia o ambiente distribuido e limpa o estado experimental
 *     description: Derruba e sobe novamente o docker compose do pipeline, limpa CSVs de metricas e remove o historico persistido do monitor.
 *     responses:
 *       200:
 *         description: Ambiente resetado com sucesso.
 */
router.post("/environment/reset", authMiddleware, roleMiddleware("ADMIN"), (req, res, next) => graspController.resetEnvironment(req, res, next));

/**
 * @swagger
 * /grasp/monitor/stream:
 *   get:
 *     tags: [Grasp]
 *     summary: Abre stream de eventos em tempo real
 *     description: Mantem uma conexao Server-Sent Events para acompanhar a execucao em tempo real. Para o frontend web, use a sessao HTTP-only; nao envie token na query string.
 *     responses:
 *       200:
 *         description: Stream SSE iniciada com sucesso.
 */
router.get("/monitor/stream", authMiddleware, anyRoleMiddleware(["ADMIN", "VIEWER"]), (req, res) => graspController.stream(req, res));

module.exports = router;
