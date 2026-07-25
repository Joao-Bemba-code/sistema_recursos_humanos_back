var express = require("express");
var router = express.Router();
var controller = require("../controllers/contratoController");
var { requireRole } = require("../protect/rbac");

router.get("/stats", controller.stats);
router.get("/", controller.listar);
router.get("/:id", controller.obter);
router.post("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.criar);
router.put("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.actualizar);
router.delete("/:id", requireRole("Administrador Geral"), controller.eliminar);

module.exports = router;
