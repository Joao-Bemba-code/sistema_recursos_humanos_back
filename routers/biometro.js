var express = require("express");
var router = express.Router();
var controller = require("../controllers/biometroController");
var { authenticate } = require("../protect/auth");
var { requireModulo } = require("../protect/rbac");

// Autoriza a ponte do biometro pelo token dedicado (x-bridge-token).
// Sem token valido, cai no fluxo normal de JWT + permissao do modulo assiduidade.
var autorizarPonte = function (req, res, next) {
  var token = (req.headers["x-bridge-token"] || "").toString();
  var esperado = (process.env.BIOMETRO_BRIDGE_TOKEN || "").toString();
  if (esperado && token === esperado) {
    req.viaPonte = true;
    return next();
  }
  return authenticate(req, res, function (err) {
    if (err) return next(err);
    return requireModulo("assiduidade", "create", "Administrador Geral", "Director Geral", "Director de Recursos Humanos")(req, res, next);
  });
};

router.post("/sincronizar", autorizarPonte, controller.sincronizar);
router.get("/mapeamento", authenticate, requireModulo("assiduidade", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.mapeamento);
router.get("/picagens", authenticate, requireModulo("assiduidade", "read", "Administrador Geral", "Director Geral", "Director de Recursos Humanos"), controller.picagens);

module.exports = router;
