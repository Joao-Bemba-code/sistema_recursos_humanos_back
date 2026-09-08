var express = require("express");
var router = express.Router();
var controller = require("../controllers/folhaSalarialController");
var { requireRole } = require("../protect/rbac");

router.get("/contrato-actual/:colaborador_id", controller.getContratoActual);

router.get("/vencimentos", controller.listVencimentos);
router.get("/vencimentos/:id", controller.getVencimento);
router.post("/vencimentos", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.createVencimento);
router.put("/vencimentos/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.updateVencimento);
router.delete("/vencimentos/:id", requireRole("Administrador Geral"), controller.removeVencimentos);

router.get("/pagamentos", controller.listPagamentos);
router.post("/pagamentos", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.createPagamento);
router.post("/pagamentos/gerar-automaticos", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.gerarPagamentosAutomaticos);
router.put("/pagamentos/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.updatePagamento);
router.delete("/pagamentos/:id", requireRole("Administrador Geral"), controller.removePagamento);
router.post("/pagamentos/:id/recalcular-faltas", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.recalcularFaltas);

module.exports = router;
