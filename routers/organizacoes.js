var express = require("express");
var router = express.Router();
var organizacaoController = require("../controllers/organizacaoController");
var { requireModuloOuRole } = require("../protect/rbac");
var { Organizacao } = require("../models");
var { guardarFicheiro, urlDoFicheiro, apagarFicheiroDeUrl } = require("../helpers/ficheiros");

// Configuracoes (organizacao): matriz de permissoes no modulo "configuracoes"
// + perfis classicos como alternativa.
router.get("/", requireModuloOuRole("configuracoes", "read", "Administrador Geral", "Director Geral"), organizacaoController.list);
router.get("/:id", requireModuloOuRole("configuracoes", "read", "Administrador Geral", "Director Geral"), organizacaoController.getById);
router.post("/", requireModuloOuRole("configuracoes", "create", "Administrador Geral"), organizacaoController.create);
router.put("/:id", requireModuloOuRole("configuracoes", "update", "Administrador Geral", "Director Geral"), organizacaoController.update);
router.delete("/:id", requireModuloOuRole("configuracoes", "delete", "Administrador Geral"), organizacaoController.remove);

router.post("/:id/logo", requireModuloOuRole("configuracoes", "update", "Administrador Geral", "Director Geral"), async function (req, res) {
  try {
    var org = await Organizacao.findByPk(req.params.id);
    if (!org) return res.status(404).json({ error: "Organizacao nao encontrada" });

    if (!req.files || !req.files.logo) {
      return res.status(400).json({ error: "Nenhum ficheiro enviado" });
    }

    var guardado = await guardarFicheiro({
      file: req.files.logo,
      pasta: "logos",
      organizacao_id: req.utilizador.organizacao_id,
      carregado_por: req.utilizador.id,
    });

    // O logo antigo (Cloudinary ou disco) deixa de ser usado
    if (org.logo_url) {
      await apagarFicheiroDeUrl(org.logo_url);
    }

    var logoUrl = urlDoFicheiro(guardado) + "?v=" + Date.now();
    await org.update({ logo_url: logoUrl });

    return res.status(200).json({ mensagem: "Logo atualizado com sucesso", dados: { logo_url: logoUrl } });
  } catch (e) {
    var limite = /demasiado grande/i.test(e.message);
    console.log("Erro ao upload logo:", e.message);
    return res.status(limite ? 413 : 500).json({ error: limite ? e.message : "Erro ao fazer upload do logo" });
  }
});

module.exports = router;
