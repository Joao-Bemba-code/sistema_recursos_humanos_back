var express = require("express");
var { authenticate } = require("../protect/auth");
var { MAX_GUARDADO, urlDoFicheiro, guardarFicheiro } = require("../helpers/ficheiros");

var router = express.Router();

// Upload generico. O conteudo vai para o Cloudinary (ou disco local como
// fallback) e na base de dados fica apenas o registo/metadados.
router.post("/", authenticate, async function (req, res) {
  try {
    if (!req.files || !req.files.ficheiro) {
      return res.status(400).json({ error: "Nenhum ficheiro enviado" });
    }

    var ficheiro = req.files.ficheiro;

    var guardado = await guardarFicheiro({
      file: ficheiro,
      pasta: req.body.pasta || "geral",
      organizacao_id: req.utilizador.organizacao_id,
      carregado_por: req.utilizador.id,
    });

    return res.status(201).json({
      mensagem: "Ficheiro carregado com sucesso",
      dados: {
        id: guardado.id,
        url: urlDoFicheiro(guardado),
        nome_original: ficheiro.name,
        nome_ficheiro: guardado.nome,
        tamanho: guardado.tamanho,
        tipo: guardado.tipo,
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

module.exports = router;
