var express = require("express");
var router = express.Router();
var { requireModulo } = require("../protect/rbac");
var ctrl = require("../controllers/processoDisciplinarController");

// Convocatórias para entrevista disciplinar
router.get("/convocatorias", requireModulo("processos_disciplinares", "read"), ctrl.listConvocatorias);
router.post("/convocatorias", requireModulo("processos_disciplinares", "create"), ctrl.createConvocatoria);
router.get("/convocatorias/:id", requireModulo("processos_disciplinares", "read"), ctrl.getConvocatoria);
router.put("/convocatorias/:id", requireModulo("processos_disciplinares", "update"), ctrl.updateConvocatoria);
router.delete("/convocatorias/:id", requireModulo("processos_disciplinares", "delete"), ctrl.removeConvocatoria);

// Medidas disciplinares e controlo de prazos
router.get("/medidas/resumo", requireModulo("processos_disciplinares", "read"), ctrl.resumoMedidas);
router.get("/medidas", requireModulo("processos_disciplinares", "read"), ctrl.listMedidas);
router.post("/medidas", requireModulo("processos_disciplinares", "create"), ctrl.createMedida);
router.get("/medidas/:id", requireModulo("processos_disciplinares", "read"), ctrl.getMedida);
router.put("/medidas/:id", requireModulo("processos_disciplinares", "update"), ctrl.updateMedida);
router.delete("/medidas/:id", requireModulo("processos_disciplinares", "delete"), ctrl.removeMedida);

module.exports = router;
