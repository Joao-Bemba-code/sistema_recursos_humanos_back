var express = require("express");
var rateLimit = require("express-rate-limit");
var router = express.Router();
var authController = require("../controllers/authController");
var { authenticate } = require("../protect/auth");
var { authValidation } = require("../validators");

// Limite anti-forca-bruta nos logins publicos.
var limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Demasiadas tentativas. Tente novamente mais tarde." },
});

router.post("/login", limiteLogin, authValidation, authController.login);
router.post("/register", authenticate, authValidation, authController.register);
router.get("/profile", authenticate, authController.getProfile);
router.put("/change-password", authenticate, authController.changePassword);

module.exports = router;
