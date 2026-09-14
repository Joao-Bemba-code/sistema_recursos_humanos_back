var express = require("express");
var router = express.Router();
var controller = require("../controllers/formacaoController");
var { requireModulo } = require("../protect/rbac");

router.get("/cursos", requireModulo("formacao", "read", "Administrador Geral", "Director Geral", "Director Pedagógico"), controller.listCursos);
router.get("/cursos/:id", requireModulo("formacao", "read", "Administrador Geral", "Director Geral", "Director Pedagógico"), controller.getCurso);
router.post("/cursos", requireModulo("formacao", "create", "Administrador Geral", "Director Geral", "Director Pedagógico"), controller.createCurso);
router.put("/cursos/:id", requireModulo("formacao", "update", "Administrador Geral", "Director Geral", "Director Pedagógico"), controller.updateCurso);
router.delete("/cursos/:id", requireModulo("formacao", "delete", "Administrador Geral"), controller.removeCurso);

router.get("/inscricoes", requireModulo("formacao", "read", "Administrador Geral", "Director Geral", "Director Pedagógico"), controller.listInscricoes);
router.post("/inscricoes", requireModulo("formacao", "create", "Administrador Geral", "Director Geral", "Director Pedagógico"), controller.createInscricao);
router.put("/inscricoes/:id", requireModulo("formacao", "update", "Administrador Geral", "Director Geral", "Director Pedagógico"), controller.updateInscricao);

module.exports = router;
