var express = require("express");
var router = express.Router();
var controller = require("../controllers/pedidoColaboradorController");

router.get("/stats", controller.getStats);
router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.put("/:id/estado", controller.updateEstado);

module.exports = router;
