var express = require("express");
var router = express.Router();
var tarefaController = require("../controllers/tarefaController");
var { requireModuloOuRole } = require("../protect/rbac");

// Perfis classicos com gestao de tarefas (a matriz de permissoes e a via
// principal; os nomes mantem a compatibilidade com os perfis existentes).
var GESTORES = ["Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"];
var LEITORES = GESTORES.concat(["Director Pedagógico"]);

var leitura = function () {
  return requireModuloOuRole("tarefas", "read", LEITORES[0], LEITORES[1], LEITORES[2], LEITORES[3], LEITORES[4]);
};
var gestao = function () {
  return requireModuloOuRole("tarefas", "create", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]);
};
var edicao = function () {
  return requireModuloOuRole("tarefas", "update", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]);
};

// Leitura (o controller restringe ao proprio colaborador quando nao e gestor)
router.get("/", leitura(), tarefaController.list);
router.get("/estatisticas", leitura(), tarefaController.estatisticas);
router.get("/:id", leitura(), tarefaController.getById);

// Gestao (criar/editar/avaliar/reabrir/cancelar/eliminar) - a qualquer momento
router.post("/", gestao(), tarefaController.create);
router.put("/:id", gestao(), tarefaController.update);
router.post("/:id/alocacoes", gestao(), tarefaController.adicionarAlocacoes);
router.put("/:id/alocacoes/:alocId", gestao(), tarefaController.editarAlocacao);
router.delete("/:id/alocacoes/:alocId", gestao(), tarefaController.removerAlocacao);
router.put("/:id/alocacoes/:alocId/decisao", gestao(), tarefaController.decidirJustificativa);
router.put("/:id/validar", gestao(), tarefaController.validar);
router.put("/:id/reabrir", gestao(), tarefaController.reabrir);
router.put("/:id/cancelar", gestao(), tarefaController.cancelar);
router.delete("/:id", requireModuloOuRole("tarefas", "delete", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]), tarefaController.remove);

// Execucao do colaborador atribuido (o controller valida a titularidade)
router.put("/:id/iniciar", edicao(), tarefaController.iniciar);
router.put("/:id/alocacoes/:alocId/iniciar", edicao(), tarefaController.iniciarAlocacao);
router.put("/:id/alocacoes/:alocId/justificar", edicao(), tarefaController.justificarAlocacao);
router.put("/:id/alocacoes/:alocId/terminar", edicao(), tarefaController.terminar);

// Legado: o progresso e automatico - a rota so explica a mudanca.
router.put("/:id/progresso", edicao(), tarefaController.progresso);

module.exports = router;
