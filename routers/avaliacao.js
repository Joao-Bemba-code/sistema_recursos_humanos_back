var express = require("express");
var router = express.Router();
var controller = require("../controllers/avaliacaoController");
var { requireRole } = require("../protect/rbac");

router.get("/ciclos", controller.listCiclos);
router.get("/ciclos/:id", controller.getCiclo);
router.post("/ciclos", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.createCiclo);
router.put("/ciclos/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.updateCiclo);
router.delete("/ciclos/:id", requireRole("Administrador Geral"), controller.removeCiclo);

router.get("/avaliacoes", controller.listAvaliacoes);
router.post("/avaliacoes", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.createAvaliacao);
router.put("/avaliacoes/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.updateAvaliacao);

module.exports = router;
