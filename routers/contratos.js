var express = require("express");
var router = express.Router();
var controller = require("../controllers/contratoController");

router.get("/stats", controller.stats);
router.get("/", controller.listar);
router.get("/:id", controller.obter);
router.post("/", controller.criar);
router.put("/:id", controller.actualizar);
router.delete("/:id", controller.eliminar);

module.exports = router;
