var express = require("express");
var router = express.Router();
var controller = require("../controllers/creditoController");
var { requireLevel } = require("../protect/rbac");

// Modulo restrito: apenas a administracao geral do sistema (nivel 4) gere creditos.
// Os colaboradores nao tem qualquer acesso a este modulo.

router.get("/resumo", requireLevel(4), controller.getResumo);
router.get("/", requireLevel(4), controller.listCreditos);
router.get("/:id", requireLevel(4), controller.getCredito);
router.post("/", requireLevel(4), controller.createCredito);
router.put("/:id", requireLevel(4), controller.updateCredito);
router.post("/:id/cancelar", requireLevel(4), controller.cancelarCredito);
router.delete("/:id", requireLevel(4), controller.removeCredito);

module.exports = router;
