var express = require("express");
var router = express.Router();
var controller = require("../controllers/faltasController");
var { requireModulo } = require("../protect/rbac");

router.get("/resumo", requireModulo("faltas", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.resumo);
router.get("/registos", requireModulo("faltas", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.registros);
router.post("/justificar/:id", requireModulo("faltas", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.justificar);
router.delete("/justificar/:id", requireModulo("faltas", "delete", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.removerJustificacao);
router.delete("/eliminar/:id", requireModulo("faltas", "delete", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.eliminar);

module.exports = router;
