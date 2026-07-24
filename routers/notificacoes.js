var express = require("express");
var router = express.Router();
var controller = require("../controllers/notificacaoController");

router.get("/", controller.list);
router.put("/read-all", controller.markAllRead);
router.put("/:id/read", controller.markRead);

module.exports = router;
