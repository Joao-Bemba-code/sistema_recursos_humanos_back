var express = require("express");
var router = express.Router();
var colaboradorController = require("../controllers/colaboradorController");
var { requireModulo } = require("../protect/rbac");
var { paginationValidation, collaboratorValidation } = require("../validators");

router.get("/stats", requireModulo("colaboradores", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), colaboradorController.stats);
router.get("/", requireModulo("colaboradores", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), paginationValidation, colaboradorController.list);
router.get("/:id", requireModulo("colaboradores", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), colaboradorController.getById);
router.post("/", requireModulo("colaboradores", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), collaboratorValidation, colaboradorController.create);
router.put("/:id/status", requireModulo("colaboradores", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), colaboradorController.updateStatus);
router.put("/:id", requireModulo("colaboradores", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), colaboradorController.update);
router.delete("/:id", requireModulo("colaboradores", "delete", "Administrador Geral", "Director de Recursos Humanos"), colaboradorController.remove);

module.exports = router;
