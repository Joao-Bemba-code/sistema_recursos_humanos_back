var express = require("express");
var router = express.Router();
var controller = require("../controllers/avaliacaoController");

router.get("/ciclos", controller.listCiclos);
router.get("/ciclos/:id", controller.getCiclo);
router.post("/ciclos", controller.createCiclo);
router.put("/ciclos/:id", controller.updateCiclo);
router.delete("/ciclos/:id", controller.removeCiclo);

router.get("/avaliacoes", controller.listAvaliacoes);
router.post("/avaliacoes", controller.createAvaliacao);
router.put("/avaliacoes/:id", controller.updateAvaliacao);

module.exports = router;
