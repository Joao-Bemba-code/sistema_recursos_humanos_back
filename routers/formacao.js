var express = require("express");
var router = express.Router();
var controller = require("../controllers/formacaoController");
var { requireRole } = require("../protect/rbac");

router.get("/cursos", controller.listCursos);
router.get("/cursos/:id", controller.getCurso);
router.post("/cursos", requireRole("Administrador Geral", "Director Geral", "Director Pedagógico"), controller.createCurso);
router.put("/cursos/:id", requireRole("Administrador Geral", "Director Geral", "Director Pedagógico"), controller.updateCurso);
router.delete("/cursos/:id", requireRole("Administrador Geral"), controller.removeCurso);

router.get("/inscricoes", controller.listInscricoes);
router.post("/inscricoes", requireRole("Administrador Geral", "Director Geral", "Director Pedagógico"), controller.createInscricao);
router.put("/inscricoes/:id", requireRole("Administrador Geral", "Director Geral", "Director Pedagógico"), controller.updateInscricao);

module.exports = router;
