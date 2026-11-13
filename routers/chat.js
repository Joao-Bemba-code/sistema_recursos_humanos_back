var express = require("express");
var router = express.Router();
var controller = require("../controllers/chatController");

// Chat interno: acessivel a qualquer utilizador autenticado da organizacao.
router.get("/utilizadores", controller.listarUtilizadores);
router.get("/conversas", controller.listConversas);
router.post("/conversas", controller.abrirConversa);
router.get("/nao-lidas", controller.naoLidas);
router.get("/conversas/:id/mensagens", controller.listMensagens);
router.post("/mensagens", controller.enviarMensagem);
router.get("/mensagens/:id/anexo", controller.baixarAnexo);

module.exports = router;
