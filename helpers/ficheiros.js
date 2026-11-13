var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");
var cloudinary = require("../config/cloudinary");
var { sequelize } = require("../config");
var { Ficheiro } = require("../models");

var UPLOAD_DIR = path.join(__dirname, "..", "uploads");
// Limite por ficheiro (2 MB) - medido no tamanho original enviado
var MAX_GUARDADO = 2 * 1024 * 1024;
// Limite para a migracao de ficheiros ja existentes no disco
var MAX_IMPORTACAO = 15 * 1024 * 1024;
var FORMATO_LIMITE = "2 MB";

var MIME_POR_EXTENSAO = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".json": "application/json",
};

// Colunas que guardam referencias a ficheiros. Na migracao passam a apontar
// directamente para o URL final (Cloudinary).
var REFERENCIAS = [
  ["colaboradores", "fotografia"],
  ["colaboradores", "curriculo"],
  ["utilizadores", "fotografia"],
  ["pedidos_colaborador", "documento"],
  ["registos_presenca", "documento_justificacao"],
  ["organizacoes", "logo_url"],
  ["contratos", "documento"],
  ["ferias", "documento"],
  ["licencas", "documento"],
  ["ocorrencias_disciplinares", "documento"],
];

function cloudinaryConfigurado() {
  return !!process.env.CLOUDINARY_CLOUD_NAME && !!process.env.CLOUDINARY_API_KEY && !!process.env.CLOUDINARY_API_SECRET;
}

function sanitizarPasta(pasta) {
  var p = String(pasta || "geral").replace(/[^a-zA-Z0-9_-]/g, "");
  return p || "geral";
}

function urlDoFicheiro(ficheiro) {
  return ficheiro.url;
}

function idDaUrl(url) {
  if (!url) return null;
  var clean = String(url).split("?")[0];
  var m = clean.match(/\/api\/ficheiros\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
  return m ? m[1] : null;
}

function mimePorExtensao(ficheiro) {
  var ext = path.extname((ficheiro && ficheiro.name) || "").toLowerCase();
  return MIME_POR_EXTENSAO[ext] || (ficheiro && ficheiro.mimetype) || "application/octet-stream";
}

function nomePublicId(nome) {
  return Date.now() + "_" + String(nome || "ficheiro").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
}

// Envia o conteudo para o Cloudinary. Comprime imagens (q_auto) no envio.
function enviarParaCloudinary(buffer, opcoes) {
  return new Promise(function (resolve, reject) {
    var opcoesUpload = {
      folder: "sghr/" + opcoes.pasta,
      public_id: opcoes.public_id,
      resource_type: "auto",
      overwrite: false,
      unique_filename: true,
      use_filename: false,
    };
    if (opcoes.imagem) {
      // A API so aceita transformation como objecto/array - uma string como
      // "q_auto" devolve "Unknown transformation".
      opcoesUpload.transformation = [{ quality: "auto" }];
    }

    var stream = cloudinary.uploader.upload_stream(opcoesUpload, function (err, result) {
      if (err) return reject(err);
      resolve({ url: result.secure_url, public_id: result.public_id });
    });
    stream.end(buffer);
  });
}

// Guarda um ficheiro: conteudo no Cloudinary, apenas metadados na BD.
// Aceita { file } (express-fileupload) ou { buffer } directo.
// Sem Cloudinary configurado, faz fallback para o disco local (uploads/).
async function guardarFicheiro(opcoes) {
  var buffer = opcoes.buffer;
  if (!buffer && opcoes.file) buffer = opcoes.file.data;
  if (!buffer || !buffer.length) {
    throw new Error("Sem dados de ficheiro");
  }

  var limite = typeof opcoes.limite === "number" ? opcoes.limite : MAX_GUARDADO;
  if (buffer.length > limite) {
    var excedido = limite >= MAX_IMPORTACAO ? FORMATO_LIMITE : Math.round(limite / (1024 * 1024)) + " MB";
    throw new Error("Ficheiro demasiado grande (maximo " + excedido + " por ficheiro)");
  }

  var nome = opcoes.nome || (opcoes.file && opcoes.file.name) || "ficheiro";
  var tipo = opcoes.tipo || mimePorExtensao(opcoes.file || { name: nome });
  var pasta = sanitizarPasta(opcoes.pasta);
  var publicId = nomePublicId(nome);

  var url = null;
  var publicIdGuardado = null;

  if (cloudinaryConfigurado()) {
    var enviado = await enviarParaCloudinary(buffer, {
      pasta: pasta,
      public_id: publicId,
      imagem: /^image\//.test(tipo),
    });
    url = enviado.url;
    publicIdGuardado = enviado.public_id;
  } else {
    // Fallback local (mantido para funcionar antes das chaves do Cloudinary)
    var pastaDir = path.join(UPLOAD_DIR, pasta);
    if (!fs.existsSync(pastaDir)) {
      fs.mkdirSync(pastaDir, { recursive: true });
    }
    fs.writeFileSync(path.join(pastaDir, publicId), buffer);
    url = "/uploads/" + pasta + "/" + publicId;
  }

  var ficheiro = await Ficheiro.create({
    organizacao_id: opcoes.organizacao_id || null,
    carregado_por: opcoes.carregado_por || null,
    pasta: pasta,
    nome: String(nome).slice(0, 250),
    tipo: tipo,
    tamanho: buffer.length,
    url: url,
    public_id: publicIdGuardado,
    caminho_antigo: opcoes.caminho_antigo || null,
  });

  return ficheiro;
}

async function obterFicheiro(id, organizacao_id) {
  if (!id) return null;
  var ficheiro = await Ficheiro.findByPk(id);
  if (!ficheiro) return null;
  if (ficheiro.organizacao_id && organizacao_id && String(ficheiro.organizacao_id) !== String(organizacao_id)) {
    return null;
  }
  return ficheiro;
}

function descarregarUrl(url) {
  return new Promise(function (resolve, reject) {
    var cliente = url.indexOf("https") === 0 ? https : http;
    var pedido = cliente.get(url, function (resposta) {
      if (resposta.statusCode >= 300 && resposta.statusCode < 400 && resposta.headers.location) {
        resposta.resume();
        return descarregarUrl(resposta.headers.location).then(resolve, reject);
      }
      if (resposta.statusCode !== 200) {
        resposta.resume();
        return reject(new Error("HTTP " + resposta.statusCode));
      }
      var partes = [];
      resposta.on("data", function (p) { partes.push(p); });
      resposta.on("end", function () { resolve(Buffer.concat(partes)); });
      resposta.on("error", reject);
    });
    pedido.on("error", reject);
    pedido.setTimeout(20000, function () { pedido.destroy(new Error("Timeout")); });
  });
}

// O Cloudinary bloqueia a entrega directa de PDF/ZIP (responde 401) quando a
// conta tem essa restricao ligada. Nesses casos e preciso um URL assinado.
// Devolve null quando nao e um URL do Cloudinary ou quando nao da para assinar.
async function urlAssinadaCloudinary(url) {
  if (!cloudinaryConfigurado()) return null;

  var limpo = String(url).split("?")[0];
  if (limpo.indexOf("res.cloudinary.com") === -1) return null;

  var registo = await Ficheiro.findOne({ where: { url: limpo } });
  var publicId = registo && registo.public_id ? registo.public_id : null;
  var formato = registo ? path.extname(String(registo.nome || "")).replace(".", "").toLowerCase() : "";

  if (!publicId) {
    // Sem registo: deduzir do proprio URL (.../upload/v123/<public_id>.<ext>).
    var m = limpo.match(/\/upload\/(?:v\d+\/)?(.+)$/);
    if (!m) return null;
    var caminho = m[1];
    var ext = path.extname(caminho).replace(".", "").toLowerCase();
    if (!ext) return null;
    publicId = caminho.substring(0, caminho.length - ext.length - 1);
    formato = ext;
  }
  if (!publicId || !formato) return null;

  var mime = String((registo && registo.tipo) || "").toLowerCase();
  var recurso = (formato === "pdf" || mime.indexOf("image/") === 0) ? "image" : "raw";

  return cloudinary.utils.private_download_url(publicId, formato, {
    resource_type: recurso,
    type: "upload",
  });
}

// Le qualquer referencia a ficheiro (URL http do Cloudinary, /uploads/...
// legado ou /api/ficheiros/<id>) e devolve o conteudo em Buffer.
async function lerBufferDeUrl(url) {
  if (!url) return null;
  var clean = String(url).split("?")[0];

  var id = idDaUrl(clean);
  if (id) {
    var registo = await Ficheiro.findByPk(id);
    if (registo) return lerBufferDeUrl(registo.url);
    return null;
  }

  if (/^https?:\/\//.test(clean)) {
    try {
      return await descarregarUrl(clean);
    } catch (e) {
      // PDF/ZIP com entrega restrita no Cloudinary: tentar o URL assinado.
      var assinada = null;
      try {
        assinada = await urlAssinadaCloudinary(clean);
      } catch (e2) {
        assinada = null;
      }
      if (assinada) {
        try {
          return await descarregarUrl(assinada);
        } catch (e3) {
          console.log("Aviso: nao foi possivel descarregar " + clean + " (assinado): " + e3.message);
          return null;
        }
      }
      console.log("Aviso: nao foi possivel descarregar " + clean + ": " + e.message);
      return null;
    }
  }

  if (clean.indexOf("/uploads/") !== -1) {
    var relativo = clean.substring(clean.indexOf("/uploads/") + "/uploads/".length).replace(/\.\./g, "");
    var caminho = path.join(UPLOAD_DIR, relativo);
    if (fs.existsSync(caminho)) {
      return fs.readFileSync(caminho);
    }
  }

  return null;
}

// Nome do ficheiro a partir de uma referencia guardada (URL do Cloudinary,
// /uploads/... legado ou /api/ficheiros/<id>). O nome sugerido pelo ecra manda
// (ex.: "comprovativo-justificacao.pdf"); da referencia aproveita-se apenas a
// extensao real, para nao sair um nome como "1794555377889_x.pdf.pdf".
function nomeDeReferencia(referencia, nomeSugerido) {
  var limpo = String(referencia || "").split("?")[0];
  var partes = limpo.split("/");
  var ultimo = partes[partes.length - 1] || "";
  try {
    ultimo = decodeURIComponent(ultimo);
  } catch (e) {
    // fica como esta
  }

  var ext = "";
  if (ultimo && ultimo.indexOf(".") !== -1) {
    ext = "." + ultimo.split(".").pop().toLowerCase();
  }

  var base = nomeSugerido ? String(nomeSugerido) : (ultimo || "documento");
  if (ext) {
    if (base.toLowerCase().slice(-ext.length) === ext) return base;
    var ponto = base.lastIndexOf(".");
    if (ponto > 0) base = base.substring(0, ponto);
    base += ext;
  }
  return base || "documento";
}

// Le qualquer referencia a ficheiro e envia o conteudo como anexo para
// descarregar (Content-Disposition: attachment). Devolve true quando enviou o
// ficheiro e false quando nao o encontrou - o controlador trata o 404.
async function responderComFicheiro(res, referencia, nomeSugerido) {
  if (!referencia) return false;
  var buffer = await lerBufferDeUrl(referencia);
  if (!buffer) return false;

  var nome = nomeDeReferencia(referencia, nomeSugerido);
  var extensao = nome.indexOf(".") !== -1 ? "." + nome.split(".").pop().toLowerCase() : "";

  res.setHeader("Content-Type", MIME_POR_EXTENSAO[extensao] || "application/octet-stream");
  res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(nome));
  res.setHeader("Content-Length", buffer.length);
  res.send(buffer);
  return true;
}

// O destroy() do SDK NAO aceita "auto": tenta primeiro o tipo que o MIME
// indica e, se nao encontrar, os restantes (o upload foi feito com "auto").
async function apagarNoCloudinary(publicId, tipo) {
  var mime = String(tipo || "").toLowerCase();
  var tipos = [];
  if (mime.indexOf("image/") === 0) tipos.push("image");
  else if (mime.indexOf("video/") === 0 || mime.indexOf("audio/") === 0) tipos.push("video");
  else if (mime) tipos.push("raw");
  ["image", "raw", "video"].forEach(function (t) { if (tipos.indexOf(t) === -1) tipos.push(t); });

  for (var i = 0; i < tipos.length; i++) {
    try {
      var r = await cloudinary.uploader.destroy(publicId, { resource_type: tipos[i] });
      if (r && r.result === "ok") return true;
    } catch (e) { /* tipo errado - tenta o seguinte */ }
  }
  return false;
}

// Apaga o ficheiro: registo na BD + conteudo no Cloudinary (+ disco legado)
async function apagarFicheiroDeUrl(url) {
  if (!url) return;
  try {
    var clean = String(url).split("?")[0];

    var registo = await Ficheiro.findOne({ where: { url: clean } });
    if (!registo && idDaUrl(clean)) {
      registo = await Ficheiro.findByPk(idDaUrl(clean));
    }

    if (registo) {
      if (registo.public_id && cloudinaryConfigurado()) {
        var apagado = await apagarNoCloudinary(registo.public_id, registo.tipo);
        if (!apagado) console.log("Aviso: nao foi possivel apagar do Cloudinary: " + registo.public_id);
      }
      await registo.destroy();
      return;
    }

    if (clean.indexOf("/uploads/") !== -1) {
      var relativo = clean.substring(clean.indexOf("/uploads/") + "/uploads/".length).replace(/\.\./g, "");
      var caminho = path.join(UPLOAD_DIR, relativo);
      if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    }
  } catch (e) {
    console.log("Aviso: erro ao apagar ficheiro " + url + ": " + e.message);
  }
}

function listarFicheirosDisco(directorio, acumulado) {
  var out = acumulado || [];
  var entradas;
  try {
    entradas = fs.readdirSync(directorio, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  entradas.forEach(function (entrada) {
    var completo = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      listarFicheirosDisco(completo, out);
    } else {
      out.push(completo);
    }
  });
  return out;
}

function escapeLike(valor) {
  return String(valor).replace(/([_%])/g, "\\$1");
}

async function actualizarReferencias(antigo, novo) {
  var padrao = escapeLike(antigo) + "%";
  for (var i = 0; i < REFERENCIAS.length; i++) {
    var tabela = REFERENCIAS[i][0];
    var coluna = REFERENCIAS[i][1];
    try {
      await sequelize.query(
        "UPDATE `" + tabela + "` SET `" + coluna + "` = CONCAT(?, SUBSTRING(`" + coluna + "`, CHAR_LENGTH(?) + 1)) " +
        "WHERE `" + coluna + "` LIKE ?",
        { replacements: [novo, antigo, padrao] }
      );
    } catch (e) {
      // tabela/coluna pode nao existir nesta BD - ignorado de proposito
    }
  }
}

// Migra os ficheiros que ainda estao no disco (uploads/) para o Cloudinary
// e actualiza todas as referencias. Idempotente: so importa os que ainda nao
// tem registo em `ficheiros`. Depois disto os documentos sobrevivem aos
// deploys do Render. Sem Cloudinary configurado, nao faz nada.
async function importarUploadsParaBD() {
  if (!fs.existsSync(UPLOAD_DIR)) return 0;

  var caminhos = listarFicheirosDisco(UPLOAD_DIR);
  if (caminhos.length === 0) return 0;

  if (!cloudinaryConfigurado()) {
    console.log(" Cloudinary nao configurado: " + caminhos.length + " ficheiro(s) continuam apenas em disco (configure CLOUDINARY_* no .env para migrar).");
    return 0;
  }

  console.log(" A migrar " + caminhos.length + " ficheiro(s) de uploads/ para o Cloudinary...");

  var importados = 0;
  for (var i = 0; i < caminhos.length; i++) {
    var absoluto = caminhos[i];
    var relativo = "/uploads/" + path.relative(UPLOAD_DIR, absoluto).split(path.sep).join("/");

    try {
      var existente = await Ficheiro.findOne({ where: { caminho_antigo: relativo } });
      var alvo = existente;

      if (!existente) {
        var stats = fs.statSync(absoluto);
        if (stats.size > MAX_IMPORTACAO) {
          console.log("  Aviso: '" + relativo + "' excede 15MB, mantido apenas em disco.");
          continue;
        }
        var buffer = fs.readFileSync(absoluto);
        var primeiraPasta = path.relative(UPLOAD_DIR, absoluto).split(path.sep)[0] || "geral";
        alvo = await guardarFicheiro({
          buffer: buffer,
          nome: path.basename(absoluto),
          tipo: MIME_POR_EXTENSAO[path.extname(absoluto).toLowerCase()] || "application/octet-stream",
          pasta: primeiraPasta,
          caminho_antigo: relativo,
          limite: MAX_IMPORTACAO,
        });
        importados++;
      }

      await actualizarReferencias(relativo, alvo.url);
    } catch (e) {
      console.log("  Aviso: nao foi possivel migrar '" + relativo + "': " + e.message);
    }
  }

  if (importados > 0) {
    console.log(" " + importados + " ficheiro(s) migrado(s) para o Cloudinary.");
  }
  return importados;
}

module.exports = {
  UPLOAD_DIR,
  MAX_GUARDADO,
  cloudinaryConfigurado,
  sanitizarPasta,
  urlDoFicheiro,
  idDaUrl,
  guardarFicheiro,
  obterFicheiro,
  lerBufferDeUrl,
  responderComFicheiro,
  nomeDeReferencia,
  apagarFicheiroDeUrl,
  importarUploadsParaBD,
};
