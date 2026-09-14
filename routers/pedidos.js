var express = require("express");
var router = express.Router();
var controller = require("../controllers/pedidoColaboradorController");
var { requireModulo } = require("../protect/rbac");

router.get("/stats", controller.getStats);
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.put("/:id/estado", requireModulo("pedidos", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.updateEstado);
router.delete("/:id", requireModulo("pedidos", "delete", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.remove);

module.exports = router;
