var express = require("express");
var router = express.Router();
var userController = require("../controllers/userController");
var { requireRole, requireLevel } = require("../protect/rbac");
var { paginationValidation } = require("../validators");

router.get("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), paginationValidation, userController.list);
router.get("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.getById);
router.post("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.create);
router.put("/:id/email", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.changeEmail);
router.put("/:id/password", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.changePassword);
router.put("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), userController.update);
router.delete("/:id", requireRole("Administrador Geral"), userController.remove);

module.exports = router;
