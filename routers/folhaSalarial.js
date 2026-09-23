var express = require("express");
var router = express.Router();
var controller = require("../controllers/folhaSalarialController");
var { requireModulo } = require("../protect/rbac");

router.get("/contrato-actual/:colaborador_id", requireModulo("folha_salarial", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.getContratoActual);
router.get("/preview-desconto-faltas", requireModulo("folha_salarial", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.previewDescontoFaltas);
router.get("/preview-horas-extras", requireModulo("folha_salarial", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.previewHorasExtras);

router.get("/vencimentos", requireModulo("folha_salarial", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.listVencimentos);
router.get("/vencimentos/:id", requireModulo("folha_salarial", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.getVencimento);
router.post("/vencimentos", requireModulo("folha_salarial", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.createVencimento);
router.put("/vencimentos/:id", requireModulo("folha_salarial", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.updateVencimento);
router.delete("/vencimentos/:id", requireModulo("folha_salarial", "delete", "Administrador Geral"), controller.removeVencimentos);

router.get("/pagamentos", requireModulo("folha_salarial", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.listPagamentos);
router.post("/pagamentos", requireModulo("folha_salarial", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.createPagamento);
router.post("/pagamentos/gerar-automaticos", requireModulo("folha_salarial", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.gerarPagamentosAutomaticos);
router.put("/pagamentos/:id", requireModulo("folha_salarial", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.updatePagamento);
router.delete("/pagamentos/:id", requireModulo("folha_salarial", "delete", "Administrador Geral"), controller.removePagamento);
router.post("/pagamentos/:id/recalcular-faltas", requireModulo("folha_salarial", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Financeiro"), controller.recalcularFaltas);

module.exports = router;
