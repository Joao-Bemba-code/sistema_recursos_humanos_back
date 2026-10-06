var express = require("express");
var router = express.Router();
var userController = require("../controllers/userController");
var { requireModuloOuRole } = require("../protect/rbac");
var { paginationValidation } = require("../validators");

// Gestao de utilizadores: funciona com a matriz de permissoes (modulo
// "utilizadores") e mantem os perfis classicos como alternativa.
var ROLES = ["Administrador Geral", "Director Geral", "Director de Recursos Humanos"];

router.get("/", requireModuloOuRole("utilizadores", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), paginationValidation, userController.list);
router.get("/:id", requireModuloOuRole("utilizadores", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.getById);
router.post("/", requireModuloOuRole("utilizadores", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.create);
router.put("/:id/email", requireModuloOuRole("utilizadores", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.changeEmail);
router.put("/:id/password", requireModuloOuRole("utilizadores", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.changePassword);
// Bloquear / desbloquear a conta (o desbloqueio tambem reinicia as tentativas)
router.put("/:id/bloqueio", requireModuloOuRole("utilizadores", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.bloqueio);
router.put("/:id", requireModuloOuRole("utilizadores", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.update);
router.delete("/:id", requireModuloOuRole("utilizadores", "delete", "Administrador Geral"), userController.remove);

module.exports = router;
