var express = require("express");
var router = express.Router();
var controller = require("../controllers/portalController");

router.get("/registos-presenca", controller.getRegistosPresenca);
router.get("/stats", controller.getPortalStats);
router.get("/credito/elegibilidade", controller.getElegibilidadeCredito);

module.exports = router;
