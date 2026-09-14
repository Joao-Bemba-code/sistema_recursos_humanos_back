var express = require("express");
var router = express.Router();
var controller = require("../controllers/avaliacaoController");
var { requireModulo } = require("../protect/rbac");

router.get("/ciclos", requireModulo("avaliacao", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.listCiclos);
router.get("/ciclos/:id", requireModulo("avaliacao", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.getCiclo);
router.post("/ciclos", requireModulo("avaliacao", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.createCiclo);
router.put("/ciclos/:id", requireModulo("avaliacao", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.updateCiclo);
router.delete("/ciclos/:id", requireModulo("avaliacao", "delete", "Administrador Geral"), controller.removeCiclo);

router.get("/avaliacoes", requireModulo("avaliacao", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.listAvaliacoes);
router.post("/avaliacoes", requireModulo("avaliacao", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.createAvaliacao);
router.put("/avaliacoes/:id", requireModulo("avaliacao", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.updateAvaliacao);

module.exports = router;
