var express = require("express");
var router = express.Router();
var excel = require("../controllers/excelController");

router.get("/folha-salarial/:id", excel.folhaSalarial);
router.get("/resumo-pagamentos", excel.resumoPagamentos);

module.exports = router;
