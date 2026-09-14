var express = require("express");
var router = express.Router();
var controller = require("../controllers/feriasController");
var { requireModulo } = require("../protect/rbac");

router.get("/", requireModulo("ferias", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.list);
router.get("/:id", requireModulo("ferias", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.getById);
router.post("/", requireModulo("ferias", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.create);
router.put("/:id", requireModulo("ferias", "update", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.update);
router.delete("/:id", requireModulo("ferias", "delete", "Administrador Geral"), controller.remove);

module.exports = router;
