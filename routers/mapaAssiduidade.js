var express = require("express");
var router = express.Router();
var controller = require("../controllers/mapaAssiduidadeController");
var { requireModulo } = require("../protect/rbac");

var ler = requireModulo("documentos_colaborador", "read");
var criar = requireModulo("documentos_colaborador", "create");

// Descarga directa em Relatorios: o mapa nao e anexado a ficha do colaborador.
// A permissao de "download" e validada no controller.
router.get("/pdf", ler, controller.gerar);
router.post("/gerar", criar, controller.gerar);
router.post("/", criar, controller.gerar);

module.exports = router;
