var express = require("express");
var router = express.Router();
var colaboradorController = require("../controllers/colaboradorController");
var documentoController = require("../controllers/documentoController");
var { requireModulo } = require("../protect/rbac");
var { paginationValidation, collaboratorValidation } = require("../validators");

router.get("/stats", requireModulo("colaboradores", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), colaboradorController.stats);
router.get("/", requireModulo("colaboradores", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), paginationValidation, colaboradorController.list);
// Documentos do colaborador: consulta restrita pelo modulo
// "documentos_colaborador" (matriz de permissoes por perfil).
router.get("/:id/documentos", requireModulo("documentos_colaborador", "read"), documentoController.list);
router.post("/:id/documentos", requireModulo("documentos_colaborador", "create"), documentoController.create);
router.get("/:id/documentos/:docId/ficheiro", requireModulo("documentos_colaborador", "read"), documentoController.ficheiro);
router.put("/:id/documentos/:docId", requireModulo("documentos_colaborador", "update"), documentoController.update);
router.delete("/:id/documentos/:docId", requireModulo("documentos_colaborador", "delete"), documentoController.remove);
router.get("/:id", requireModulo("colaboradores", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), colaboradorController.getById);
router.post("/", requireModulo("colaboradores", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), collaboratorValidation, colaboradorController.create);
router.put("/:id/status", requireModulo("colaboradores", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), colaboradorController.updateStatus);
router.put("/:id", requireModulo("colaboradores", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), colaboradorController.update);
router.delete("/:id", requireModulo("colaboradores", "delete", "Administrador Geral", "Director de Recursos Humanos"), colaboradorController.remove);

module.exports = router;
