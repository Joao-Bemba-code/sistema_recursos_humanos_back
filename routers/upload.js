var express = require("express");
var path = require("path");
var fs = require("fs");
var { authenticate } = require("../protect/auth");

var router = express.Router();

var uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

router.post("/", authenticate, function (req, res) {
  try {
    if (!req.files || !req.files.ficheiro) {
      return res.status(400).json({ error: "Nenhum ficheiro enviado" });
    }

    var ficheiro = req.files.ficheiro;
    var pasta = req.body.pasta || "geral";
    var pastaDir = path.join(uploadDir, pasta);

    if (!fs.existsSync(pastaDir)) {
      fs.mkdirSync(pastaDir, { recursive: true });
    }

    var timestamp = Date.now();
    var extensao = path.extname(ficheiro.name);
    var nomeLimpo = ficheiro.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");
    var nomeFicheiro = timestamp + "_" + nomeLimpo;
    var caminho = path.join(pastaDir, nomeFicheiro);

    ficheiro.mv(caminho, function (err) {
      if (err) {
        console.log("Erro ao guardar ficheiro:", err.message);
        return res.status(500).json({ error: "Erro ao guardar ficheiro" });
      }

      var url = "/uploads/" + pasta + "/" + nomeFicheiro;

      return res.status(201).json({
        mensagem: "Ficheiro carregado com sucesso",
        dados: {
          url: url,
          nome_original: ficheiro.name,
          nome_ficheiro: nomeFicheiro,
          tamanho: ficheiro.size,
          tipo: ficheiro.mimetype,
        },
      });
    });
  } catch (e) {
    console.log("Erro no upload:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

module.exports = router;
