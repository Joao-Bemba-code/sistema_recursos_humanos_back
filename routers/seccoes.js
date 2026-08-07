var express = require("express");
var router = express.Router();
var controller = require("../controllers/seccaoController");
var { requireRole } = require("../protect/rbac");

router.get("/", controller.listar);
router.get("/:id", controller.obter);
router.get("/:id/membros", controller.membros);
router.post("/:id/membros", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.adicionarMembro);
router.delete("/:id/membros/:colaboradorId", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.removerMembro);
router.post("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.criar);
router.put("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.actualizar);
router.delete("/:id", requireRole("Administrador Geral"), controller.eliminar);

module.exports = router;
