var express = require("express");
var router = express.Router();
var controller = require("../controllers/bancoHorasController");
var { requireModuloOuRole } = require("../protect/rbac");

var ROLES_RH = [
  "Administrador Geral",
  "Director Geral",
  "Director de Recursos Humanos",
  "Técnico de RH",
];

// Qualquer utilizador autenticado consulta o seu proprio saldo.
router.get("/meu-saldo", controller.meuSaldo);

// Administracao: movimentos e resumo de todos os colaboradores.
router.get("/movimentos", requireModuloOuRole("assiduidade", "read", ...ROLES_RH), controller.listarMovimentos);
router.get("/resumo", requireModuloOuRole("assiduidade", "read", ...ROLES_RH), controller.resumoColaboradores);
router.get("/preview-desconto", requireModuloOuRole("folha_salarial", "read", ...ROLES_RH), controller.previewDesconto);
router.post("/justificar/:id", requireModuloOuRole("assiduidade", "update", ...ROLES_RH), controller.justificar);

module.exports = router;
