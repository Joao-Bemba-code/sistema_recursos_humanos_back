var express = require("express");
var fs = require("fs");
var path = require("path");
var router = express.Router();
var { authenticate, authenticateFlexivel } = require("../protect/auth");
var {
  UPLOAD_DIR,
  MAX_GUARDADO,
  urlDoFicheiro,
  guardarFicheiro,
  obterFicheiro,
} = require("../helpers/ficheiros");

// Upload de ficheiros: conteudo vai para o Cloudinary, na BD ficam so os
// metadados. Assim os documentos sobrevivem aos deploys do Render.
router.post("/", authenticate, async function (req, res) {
  try {
    if (!req.files || !req.files.ficheiro) {
      return res.status(400).json({ error: "Nenhum ficheiro enviado" });
    }

    var ficheiro = await guardarFicheiro({
      file: req.files.ficheiro,
      pasta: req.body.pasta || "geral",
      organizacao_id: req.utilizador.organizacao_id,
      carregado_por: req.utilizador.id,
    });

    return res.status(201).json({
      mensagem: "Ficheiro carregado com sucesso",
      dados: {
        id: ficheiro.id,
        url: urlDoFicheiro(ficheiro),
        nome_original: ficheiro.nome,
        nome_ficheiro: ficheiro.nome,
        tamanho: ficheiro.tamanho,
        tipo: ficheiro.tipo,
        limite: MAX_GUARDADO,
      },
    });
  } catch (e) {
    var limite = /demasiado grande/i.test(e.message);
    console.log("Erro no upload:", e.message);
    return res.status(limite ? 413 : 500).json({
      error: limite ? e.message : "Erro ao carregar ficheiro: " + e.message,
    });
  }
});

// Entrega o ficheiro (autenticacao por header ou ?token= para <img>/<a>).
// Ficheiros no Cloudinary sao redireccionados; os legados em disco sao
// servidos directamente.
router.get("/:id", authenticateFlexivel, async function (req, res) {
  try {
    var ficheiro = await obterFicheiro(req.params.id, req.utilizador.organizacao_id);
    if (!ficheiro) {
      return res.status(404).json({ error: "Ficheiro nao encontrado" });
    }

    if (/^https?:\/\//.test(ficheiro.url)) {
      return res.redirect(302, ficheiro.url);
    }

    var clean = String(ficheiro.url).split("?")[0];
    if (clean.indexOf("/uploads/") !== -1) {
      var relativo = clean.substring(clean.indexOf("/uploads/") + "/uploads/".length).replace(/\.\./g, "");
      var caminho = path.join(UPLOAD_DIR, relativo);
      if (fs.existsSync(caminho)) {
        res.setHeader("Content-Type", ficheiro.tipo || "application/octet-stream");
        res.setHeader("Cache-Control", "private, max-age=3600");
        return res.send(fs.readFileSync(caminho));
      }
    }

    return res.status(404).json({ error: "Conteudo do ficheiro indisponivel" });
  } catch (e) {
    console.log("Erro ao servir ficheiro:", e.message);
    return res.status(500).json({ error: "Erro ao ler ficheiro" });
  }
});

module.exports = router;
