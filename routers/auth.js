var express = require("express");
var router = express.Router();
var authController = require("../controllers/authController");
var { authenticate } = require("../protect/auth");
var { authValidation } = require("../validators");

router.post("/login", authValidation, authController.login);
router.post("/register", authenticate, authValidation, authController.register);
router.get("/profile", authenticate, authController.getProfile);
router.put("/change-password", authenticate, authController.changePassword);

module.exports = router;
