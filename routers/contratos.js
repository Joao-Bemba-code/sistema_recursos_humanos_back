var express = require("express");
var router = express.Router();
var controller = require("../controllers/contratoController");
var { requireModulo } = require("../protect/rbac");
var { contractValidation } = require("../validators");

router.get("/stats", requireModulo("contratos", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.stats);
router.get("/", requireModulo("contratos", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.listar);
router.get("/:id", requireModulo("contratos", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.obter);
router.post("/", requireModulo("contratos", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), contractValidation, controller.criar);
router.put("/:id", requireModulo("contratos", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), contractValidation, controller.actualizar);
router.delete("/:id", requireModulo("contratos", "delete", "Administrador Geral"), controller.eliminar);

module.exports = router;
