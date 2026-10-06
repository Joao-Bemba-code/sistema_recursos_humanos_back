var express = require("express");
var router = express.Router();
var tarefaController = require("../controllers/tarefaController");
var { requireModuloOuRole } = require("../protect/rbac");

// Perfis classicos com gestao de tarefas (a matriz de permissoes e a via
// principal; os nomes mantem a compatibilidade com os perfis existentes).
var GESTORES = ["Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"];
var LEITORES = GESTORES.concat(["Director Pedagógico"]);

// Leitura (o controller restringe ao proprio colaborador quando nao e gestor)
router.get("/", requireModuloOuRole("tarefas", "read", LEITORES[0], LEITORES[1], LEITORES[2], LEITORES[3], LEITORES[4]), tarefaController.list);
router.get("/estatisticas", requireModuloOuRole("tarefas", "read", LEITORES[0], LEITORES[1], LEITORES[2], LEITORES[3], LEITORES[4]), tarefaController.estatisticas);
router.get("/:id", requireModuloOuRole("tarefas", "read", LEITORES[0], LEITORES[1], LEITORES[2], LEITORES[3], LEITORES[4]), tarefaController.getById);

// Gestao (criar/editar/validar/eliminar) - o controller exige perfil de gestao
router.post("/", requireModuloOuRole("tarefas", "create", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]), tarefaController.create);
router.put("/:id", requireModuloOuRole("tarefas", "create", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]), tarefaController.update);
router.put("/:id/validar", requireModuloOuRole("tarefas", "create", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]), tarefaController.validar);
router.delete("/:id", requireModuloOuRole("tarefas", "delete", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]), tarefaController.remove);

// Execucao (colaborador atribuido ou gestor)
router.put("/:id/iniciar", requireModuloOuRole("tarefas", "update", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]), tarefaController.iniciar);
router.put("/:id/progresso", requireModuloOuRole("tarefas", "update", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]), tarefaController.progresso);
router.put("/:id/cancelar", requireModuloOuRole("tarefas", "update", GESTORES[0], GESTORES[1], GESTORES[2], GESTORES[3]), tarefaController.cancelar);

module.exports = router;
