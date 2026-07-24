var express = require("express");
var router = express.Router();
var colaboradorController = require("../controllers/colaboradorController");
var { requireRole } = require("../protect/rbac");
var { paginationValidation, collaboratorValidation } = require("../validators");

router.get("/stats", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), colaboradorController.stats);
router.get("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), paginationValidation, colaboradorController.list);
router.get("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), colaboradorController.getById);
router.post("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), collaboratorValidation, colaboradorController.create);
router.put("/:id/status", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), colaboradorController.updateStatus);
router.put("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), colaboradorController.update);
router.delete("/:id", requireRole("Administrador Geral", "Director de Recursos Humanos"), colaboradorController.remove);

module.exports = router;
