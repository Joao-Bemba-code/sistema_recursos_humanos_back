var express = require("express");
var router = express.Router();
var controller = require("../controllers/atividadeController");

// O isolamento por organizacao/titularidade e feito no controller. Tal como
// tarefas e portal, o modulo e visivel a qualquer utilizador autenticado.
router.get("/", controller.list);

module.exports = router;
