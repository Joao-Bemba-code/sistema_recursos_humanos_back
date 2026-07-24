var express = require("express");
var router = express.Router();
var organizacaoController = require("../controllers/organizacaoController");
var { requireRole } = require("../protect/rbac");

router.get("/", requireRole("Administrador Geral", "Director Geral"), organizacaoController.list);
router.get("/:id", requireRole("Administrador Geral", "Director Geral"), organizacaoController.getById);
router.post("/", requireRole("Administrador Geral"), organizacaoController.create);
router.put("/:id", requireRole("Administrador Geral", "Director Geral"), organizacaoController.update);
router.delete("/:id", requireRole("Administrador Geral"), organizacaoController.remove);

module.exports = router;
