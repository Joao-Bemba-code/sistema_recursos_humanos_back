var express = require("express");
var router = express.Router();
var controller = require("../controllers/faltasController");
var { requireRole } = require("../protect/rbac");

router.get("/resumo", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.resumo);
router.get("/registos", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.registros);
router.post("/justificar/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.justificar);
router.delete("/justificar/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.removerJustificacao);
router.delete("/eliminar/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.eliminar);

module.exports = router;
