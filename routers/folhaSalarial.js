var express = require("express");
var router = express.Router();
var controller = require("../controllers/folhaSalarialController");

router.get("/vencimentos", controller.listVencimentos);
router.get("/vencimentos/:id", controller.getVencimento);
router.post("/vencimentos", controller.createVencimento);
router.put("/vencimentos/:id", controller.updateVencimento);
router.delete("/vencimentos/:id", controller.removeVencimentos);

router.get("/pagamentos", controller.listPagamentos);
router.post("/pagamentos", controller.createPagamento);
router.put("/pagamentos/:id", controller.updatePagamento);

module.exports = router;
