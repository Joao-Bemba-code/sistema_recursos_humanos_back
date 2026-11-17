var express = require("express");
var router = express.Router();
var controller = require("../controllers/chamadaController");

// Conferencia 1:1: chamadas de voz/video nas conversas directas do chat.
router.get("/pendentes", controller.pendentes);
router.post("/", controller.criarChamada);
router.get("/:id", controller.obterChamada);
router.post("/:id/aceitar", controller.aceitarChamada);
router.post("/:id/recusar", controller.recusarChamada);
router.post("/:id/terminar", controller.terminarChamada);
router.post("/:id/sinais", controller.adicionarSinal);
router.get("/:id/sinais", controller.listarSinais);

module.exports = router;
