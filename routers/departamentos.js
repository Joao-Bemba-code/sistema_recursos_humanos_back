var express = require("express");
var router = express.Router();
var controller = require("../controllers/departamentoController");
var { requireModulo } = require("../protect/rbac");

router.get("/", requireModulo("departamentos", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.listar);
router.get("/cargos", requireModulo("departamentos", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.cargos);
router.get("/:id", requireModulo("departamentos", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.obter);
router.post("/", requireModulo("departamentos", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.criar);
router.put("/:id", requireModulo("departamentos", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.actualizar);
router.delete("/:id", requireModulo("departamentos", "delete", "Administrador Geral"), controller.eliminar);

module.exports = router;
