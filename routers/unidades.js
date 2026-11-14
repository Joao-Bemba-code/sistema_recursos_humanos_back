var express = require("express");
var router = express.Router();
var controller = require("../controllers/unidadeController");
var { requireModulo } = require("../protect/rbac");

var ler = requireModulo("departamentos", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos");
var escrever = requireModulo("departamentos", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos");
var criar = requireModulo("departamentos", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos");

router.get("/", ler, controller.listar);
router.get("/:id/colaboradores", ler, controller.colaboradores);
router.post("/:id/colaboradores", escrever, controller.adicionarColaborador);
router.delete("/:id/colaboradores/:colaboradorId", escrever, controller.removerColaborador);
router.get("/:id", ler, controller.obter);
router.post("/", criar, controller.criar);
router.put("/:id", escrever, controller.actualizar);
router.delete("/:id", requireModulo("departamentos", "delete", "Administrador Geral"), controller.eliminar);

module.exports = router;
