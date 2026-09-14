var express = require("express");
var router = express.Router();
var controller = require("../controllers/assiduidadeController");
var { requireModulo } = require("../protect/rbac");

router.get("/", requireModulo("assiduidade", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.list);
router.get("/:id", requireModulo("assiduidade", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.getById);
router.post("/", requireModulo("assiduidade", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.create);
router.put("/:id", requireModulo("assiduidade", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.update);
router.delete("/:id", requireModulo("assiduidade", "delete", "Administrador Geral"), controller.remove);

module.exports = router;
