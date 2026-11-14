var express = require("express");
var router = express.Router();
var controller = require("../controllers/plataformaController");
var authController = require("../controllers/authController");
var { authenticate } = require("../protect/auth");
var { requireSuperAdmin } = require("../protect/rbac");

// Login publico e exclusivo da plataforma (nao e o login das organizacoes).
router.post("/login", authController.loginPlataforma);

// Painel da plataforma: so contas com super_admin = true.
// Nao pertence a nenhuma organizacao e nao expoe dados de nenhuma delas
// (apenas contagens agregadas).
router.use(authenticate);
router.get("/resumo", requireSuperAdmin, controller.resumo);
router.get("/organizacoes", requireSuperAdmin, controller.listar);
router.post("/organizacoes", requireSuperAdmin, controller.criar);
router.put("/organizacoes/:id", requireSuperAdmin, controller.actualizar);
router.post("/organizacoes/:id/estado", requireSuperAdmin, controller.alterarEstado);
router.post("/organizacoes/:id/logo", requireSuperAdmin, controller.carregarLogo);
// Repor a palavra-passe de uma conta da organizacao (suporte).
router.get("/organizacoes/:id/utilizadores", requireSuperAdmin, controller.listarUtilizadores);
router.post("/organizacoes/:id/utilizadores/:utilizadorId/senha", requireSuperAdmin, controller.reporSenha);

module.exports = router;
