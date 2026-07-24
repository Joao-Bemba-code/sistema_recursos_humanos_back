var express = require("express");
var router = express.Router();
var pdf = require("../controllers/pdfController");

router.get("/folha-salarial/:id", pdf.folhaSalarial);
router.get("/contrato/:id", pdf.contrato);
router.get("/colaborador/:id", pdf.fichaColaborador);

module.exports = router;
