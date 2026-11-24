var express = require("express");
var router = express.Router();
var controller = require("../controllers/notificacaoController");

router.get("/", controller.list);
router.get("/push/config", controller.pushConfig);
router.get("/push/status", controller.pushStatus);
router.post("/push/subscribe", controller.subscribePush);
router.delete("/push/subscribe", controller.unsubscribePush);
router.post("/push/test", controller.testPush);
router.put("/read-all", controller.markAllRead);
router.put("/:id/read", controller.markRead);

module.exports = router;
