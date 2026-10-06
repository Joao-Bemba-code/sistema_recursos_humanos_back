var express = require("express");
var router = express.Router();
var controller = require("../controllers/escalaController");
var { requireModulo } = require("../protect/rbac");

router.get("/", requireModulo("assiduidade", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.list);
router.put("/:colaboradorId", requireModulo("assiduidade", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.update);

module.exports = router;
