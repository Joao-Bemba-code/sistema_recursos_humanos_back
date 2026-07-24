var express = require("express");
var router = express.Router();
var controller = require("../controllers/formacaoController");

router.get("/cursos", controller.listCursos);
router.get("/cursos/:id", controller.getCurso);
router.post("/cursos", controller.createCurso);
router.put("/cursos/:id", controller.updateCurso);
router.delete("/cursos/:id", controller.removeCurso);

router.get("/inscricoes", controller.listInscricoes);
router.post("/inscricoes", controller.createInscricao);
router.put("/inscricoes/:id", controller.updateInscricao);

module.exports = router;
