var express = require("express");
var router = express.Router();
var controller = require("../controllers/pedidoColaboradorController");
var { requireRole } = require("../protect/rbac");

router.get("/stats", controller.getStats);
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.put("/:id/estado", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.updateEstado);

module.exports = router;
