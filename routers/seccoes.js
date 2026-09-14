var express = require("express");
var router = express.Router();
var controller = require("../controllers/seccaoController");
var { requireModulo } = require("../protect/rbac");

router.get("/", requireModulo("departamentos", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.listar);
router.get("/:id", requireModulo("departamentos", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.obter);
router.get("/:id/membros", requireModulo("departamentos", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.membros);
router.post("/:id/membros", requireModulo("departamentos", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.adicionarMembro);
router.delete("/:id/membros/:colaboradorId", requireModulo("departamentos", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.removerMembro);
router.post("/", requireModulo("departamentos", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.criar);
router.put("/:id", requireModulo("departamentos", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.actualizar);
router.delete("/:id", requireModulo("departamentos", "delete", "Administrador Geral"), controller.eliminar);

module.exports = router;
