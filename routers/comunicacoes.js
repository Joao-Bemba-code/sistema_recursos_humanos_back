var express = require("express");
var router = express.Router();
var controller = require("../controllers/comunicacaoController");
var { requireRole } = require("../protect/rbac");

router.get("/", controller.list);
router.get("/:id", controller.get);
router.post("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.create);
router.put("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.update);
router.delete("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.remove);
router.put("/:id/publicar", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), controller.togglePublicado);

module.exports = router;
