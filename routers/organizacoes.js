var express = require("express");
var router = express.Router();
var path = require("path");
var fs = require("fs");
var organizacaoController = require("../controllers/organizacaoController");
var { requireRole } = require("../protect/rbac");
var { Organizacao } = require("../models");

router.get("/", requireRole("Administrador Geral", "Director Geral"), organizacaoController.list);
router.get("/:id", requireRole("Administrador Geral", "Director Geral"), organizacaoController.getById);
router.post("/", requireRole("Administrador Geral"), organizacaoController.create);
router.put("/:id", requireRole("Administrador Geral", "Director Geral"), organizacaoController.update);
router.delete("/:id", requireRole("Administrador Geral"), organizacaoController.remove);

router.post("/:id/logo", requireRole("Administrador Geral", "Director Geral"), async function (req, res) {
  try {
    var org = await Organizacao.findByPk(req.params.id);
    if (!org) return res.status(404).json({ error: "Organizacao nao encontrada" });

    if (!req.files || !req.files.logo) {
      return res.status(400).json({ error: "Nenhum ficheiro enviado" });
    }

    var logo = req.files.logo;
    var ext = path.extname(logo.name) || ".png";
    var filename = "logo_" + org.id + ext;
    var uploadDir = path.join(__dirname, "..", "uploads", "logos");

    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    var filepath = path.join(uploadDir, filename);
    await logo.mv(filepath);

    var logoUrl = "/uploads/logos/" + filename;
    await org.update({ logo_url: logoUrl });

    return res.status(200).json({ mensagem: "Logo atualizado com sucesso", dados: { logo_url: logoUrl } });
  } catch (e) {
    console.log("Erro ao upload logo:", e.message);
    return res.status(500).json({ error: "Erro ao fazer upload do logo" });
  }
});

module.exports = router;
