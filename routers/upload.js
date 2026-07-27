var express = require("express");
var path = require("path");
var fs = require("fs");
var cloudinary = require("../config/cloudinary");
var streamifier = require("streamifier");
var { authenticate } = require("../protect/auth");

var router = express.Router();

var uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

var uploadToCloudinary = function (buffer, pasta, nomeFicheiro) {
  return new Promise(function (resolve, reject) {
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return reject(new Error("Cloudinary not configured"));
    }
    var stream = cloudinary.uploader.upload_stream(
      {
        folder: "sghr/" + pasta,
        public_id: path.parse(nomeFicheiro).name,
        resource_type: "auto",
      },
      function (err, result) {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

router.post("/", authenticate, async function (req, res) {
  try {
    if (!req.files || !req.files.ficheiro) {
      return res.status(400).json({ error: "Nenhum ficheiro enviado" });
    }

    var ficheiro = req.files.ficheiro;
    var pasta = req.body.pasta || "geral";

    var timestamp = Date.now();
    var nomeLimpo = ficheiro.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_+/g, "_");
    var nomeFicheiro = timestamp + "_" + nomeLimpo;

    if (process.env.CLOUDINARY_CLOUD_NAME) {
      var url = await uploadToCloudinary(ficheiro.data, pasta, nomeFicheiro);
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
    }

    var pastaDir = path.join(uploadDir, pasta);
    if (!fs.existsSync(pastaDir)) {
      fs.mkdirSync(pastaDir, { recursive: true });
    }
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
    return res.status(500).json({ error: "Erro ao carregar ficheiro: " + e.message });
  }
});

module.exports = router;
