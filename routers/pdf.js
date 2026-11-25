var express = require("express");
var router = express.Router();
var pdf = require("../controllers/pdfController");
var { requireLevel } = require("../protect/rbac");

router.get("/folha-salarial/:id", pdf.folhaSalarial);
router.get("/resumo-pagamentos", pdf.resumoPagamentos);
router.get("/contrato/:id", pdf.contrato);
router.get("/colaborador/:id", pdf.fichaColaborador);
router.get("/aviso-advertencia/:colaboradorId", pdf.avisoAdvertencia);
router.get("/convocatoria-disciplinar/:id", pdf.convocatoriaDisciplinar);
router.get("/medidas-disciplinares", pdf.relatorioMedidasDisciplinares);
router.get("/relatorio-assiduidade", requireLevel(4), pdf.relatorioAssiduidade);
router.get("/relatorio-posicoes", requireLevel(4), pdf.relatorioPosicoes);

module.exports = router;
