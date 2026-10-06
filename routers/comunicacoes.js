var express = require("express");
var router = express.Router();
var controller = require("../controllers/comunicacaoController");
var { requireModuloOuRole } = require("../protect/rbac");

var ROLES_GESTAO = ["Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"];

// Leitura aberta a qualquer utilizador autenticado (o controller filtra por
// organizacao e visibilidade). Gestao via matriz de permissoes ("comunicados")
// + perfis classicos como alternativa.
router.get("/", controller.list);
router.get("/:id", controller.get);
router.get("/:id/anexos/:anexoId", controller.downloadAnexo);
router.post("/", requireModuloOuRole("comunicados", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.create);
router.put("/:id", requireModuloOuRole("comunicados", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.update);
router.delete("/:id", requireModuloOuRole("comunicados", "delete", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.remove);
router.put("/:id/publicar", requireModuloOuRole("comunicados", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.togglePublicado);

module.exports = router;
