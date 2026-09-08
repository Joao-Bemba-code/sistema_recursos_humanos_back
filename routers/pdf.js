var express = require("express");
var router = express.Router();
var pdf = require("../controllers/pdfController");

router.get("/folha-salarial/:id", pdf.folhaSalarial);
router.get("/resumo-pagamentos", pdf.resumoPagamentos);
router.get("/contrato/:id", pdf.contrato);
router.get("/colaborador/:id", pdf.fichaColaborador);
router.get("/aviso-advertencia/:colaboradorId", pdf.avisoAdvertencia);

module.exports = router;
