var express = require("express");
var router = express.Router();
var controller = require("../controllers/contratoController");
var { requireRole } = require("../protect/rbac");
var { contractValidation } = require("../validators");

router.get("/stats", controller.stats);
router.get("/", controller.listar);
router.get("/:id", controller.obter);
router.post("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), contractValidation, controller.criar);
router.put("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), contractValidation, controller.actualizar);
router.delete("/:id", requireRole("Administrador Geral"), controller.eliminar);

module.exports = router;
