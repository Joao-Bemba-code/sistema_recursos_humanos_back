var express = require("express");
var router = express.Router();
var controller = require("../controllers/pedidoColaboradorController");
var fichaCreditoController = require("../controllers/fichaCreditoController");
var fichaDispensaController = require("../controllers/fichaDispensaController");
var { requireModulo } = require("../protect/rbac");

router.get("/stats", controller.getStats);
router.get("/", controller.list);
router.get("/:id/documento", controller.downloadDocumento);
router.get("/:id/ficha-credito", fichaCreditoController.gerarFichaCredito);
router.get("/:id/ficha-dispensa", fichaDispensaController.gerarFichaDispensa);
router.post("/:id/documento-assinado", requireModulo("pedidos", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.anexarDocumentoAssinado);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.put("/:id/estado", requireModulo("pedidos", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.updateEstado);
router.delete("/:id", requireModulo("pedidos", "delete", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.remove);

module.exports = router;
