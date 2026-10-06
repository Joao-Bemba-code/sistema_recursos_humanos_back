var express = require("express");
var router = express.Router();
var controller = require("../controllers/feriadoController");
var { requireModulo } = require("../protect/rbac");

router.get("/", requireModulo("assiduidade", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.list);
router.post("/", requireModulo("assiduidade", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.create);
router.delete("/:id", requireModulo("assiduidade", "delete", "Administrador Geral"), controller.remove);

module.exports = router;
