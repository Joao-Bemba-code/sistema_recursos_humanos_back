var express = require("express");
var router = express.Router();
var controller = require("../controllers/feriasController");
var { requireRole } = require("../protect/rbac");

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.create);
router.put("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.update);
router.delete("/:id", requireRole("Administrador Geral"), controller.remove);

module.exports = router;
