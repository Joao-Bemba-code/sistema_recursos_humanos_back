var express = require("express");
var router = express.Router();
var tarefaController = require("../controllers/tarefaController");
var { requireModuloOuRole } = require("../protect/rbac");

// Perfis classicos com gestao de tarefas (a matriz de permissoes e a via
// principal; os nomes mantem a compatibilidade com os perfis existentes).
var GESTORES = ["Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"];

var gestao = function () {
  return requireModuloOuRole("tarefas", "create", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]);
};

// Leitura e execucao abertas a qualquer utilizador autenticado: o controller
// restringe cada colaborador as proprias atribuicoes (titularidade).
router.get("/", tarefaController.list);
router.get("/estatisticas", tarefaController.estatisticas);
router.get("/:id", tarefaController.getById);

// Gestao (criar/editar/avaliar/reabrir/cancelar/eliminar) - a qualquer momento
router.post("/", gestao(), tarefaController.create);
router.put("/:id", gestao(), tarefaController.update);
router.post("/:id/alocacoes", gestao(), tarefaController.adicionarAlocacoes);
router.put("/:id/alocacoes/:alocId", gestao(), tarefaController.editarAlocacao);
router.delete("/:id/alocacoes/:alocId", gestao(), tarefaController.removerAlocacao);
router.put("/:id/alocacoes/:alocId/decisao", gestao(), tarefaController.decidirJustificativa);
router.put("/:id/validar", gestao(), tarefaController.validar);
router.put("/:id/reabrir", gestao(), tarefaController.reabrir);
router.put("/:id/correcao", gestao(), tarefaController.solicitarCorrecao);
router.put("/:id/cancelar", gestao(), tarefaController.cancelar);
router.delete("/:id", requireModuloOuRole("tarefas", "delete", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]), tarefaController.remove);

// Execucao do colaborador atribuido (o controller valida a titularidade)
router.put("/:id/iniciar", tarefaController.iniciar);
router.put("/:id/alocacoes/:alocId/iniciar", tarefaController.iniciarAlocacao);
router.put("/:id/alocacoes/:alocId/justificar", tarefaController.justificarAlocacao);
router.put("/:id/alocacoes/:alocId/terminar", tarefaController.terminar);

// Legado: o progresso e automatico - a rota so explica a mudanca.
router.put("/:id/progresso", tarefaController.progresso);

module.exports = router;
