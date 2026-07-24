var express = require("express");
var router = express.Router();
var controller = require("../controllers/portalController");

router.get("/stats", controller.getPortalStats);

module.exports = router;
