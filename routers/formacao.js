var express = require("express");
var router = express.Router();
var controller = require("../controllers/formacaoController");
var { requireModuloOuRole } = require("../protect/rbac");

// Perfis históricos continuam a funcionar em paralelo com a matriz de permissões.
var GESTORES = ["Administrador Geral", "Director Geral", "Director Pedagógico", "Coordenador de Formação"];

router.get("/cursos", requireModuloOuRole("formacao", "read", ...GESTORES), controller.listCursos);
router.get("/cursos/:id", requireModuloOuRole("formacao", "read", ...GESTORES), controller.getCurso);
router.post("/cursos", requireModuloOuRole("formacao", "create", ...GESTORES), controller.createCurso);
router.put("/cursos/:id", requireModuloOuRole("formacao", "update", ...GESTORES), controller.updateCurso);
router.delete("/cursos/:id", requireModuloOuRole("formacao", "delete", "Administrador Geral", "Director Geral"), controller.removeCurso);

router.get("/inscricoes", requireModuloOuRole("formacao", "read", ...GESTORES), controller.listInscricoes);
router.post("/inscricoes", requireModuloOuRole("formacao", "create", ...GESTORES), controller.createInscricao);

// Certificado real (PDF/PNG/JPG) carregado pelo RH. O download é permitido ao
// próprio colaborador mesmo sem permissão administrativa no módulo.
router.post("/inscricoes/:id/certificado", requireModuloOuRole("formacao", "update", ...GESTORES), controller.anexarCertificado);
router.delete("/inscricoes/:id/certificado", requireModuloOuRole("formacao", "update", ...GESTORES), controller.removerCertificado);
router.get("/inscricoes/:id/certificado", controller.descarregarCertificado);

// Avaliação formal (nota 0-20 + resultado automático + documento opcional).
// Aceita multipart para permitir anexar o certificado no mesmo passo.
router.put("/inscricoes/:id/avaliacao", requireModuloOuRole("formacao", "update", ...GESTORES), controller.registarAvaliacao);

router.put("/inscricoes/:id", requireModuloOuRole("formacao", "update", ...GESTORES), controller.updateInscricao);
router.delete("/inscricoes/:id", requireModuloOuRole("formacao", "delete", "Administrador Geral", "Director Geral"), controller.removeInscricao);

// Painel do colaborador: o backend restringe sempre aos dados da própria conta.
// Um gestor pode passar ?colaborador_id= para pré-visualizar o painel de outrem.
router.get("/minhas", controller.listMinhasFormacoes);
router.post("/minhas/inscricoes", controller.inscreverMe);

module.exports = router;
