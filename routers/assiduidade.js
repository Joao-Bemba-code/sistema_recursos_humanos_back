var express = require("express");
var router = express.Router();
var controller = require("../controllers/assiduidadeController");

router.get("/", controller.list);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
