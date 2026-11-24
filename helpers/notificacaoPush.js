var crypto = require("crypto");

var ORDEM_P256 = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
var ASSUNTO_PADRAO = "mailto:suporte@sg-hr.ao";

var base64url = function (buffer) {
  return Buffer.from(buffer).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

var decodificarBase64url = function (valor) {
  if (typeof valor !== "string" || !/^[A-Za-z0-9_-]+$/.test(valor)) return null;
  var texto = valor.replace(/-/g, "+").replace(/_/g, "/");
  texto += "=".repeat((4 - (texto.length % 4)) % 4);
  var buffer = Buffer.from(texto, "base64");
  if (!buffer.length || base64url(buffer) !== valor) return null;
  return buffer;
};

var hashEndpoint = function (endpoint) {
  return crypto.createHash("sha256").update(String(endpoint), "utf8").digest("hex");
};

// Permite apenas caminhos internos. Assim uma notificacao nunca abre um site
// externo ou um URL com credenciais escondidas.
var normalizarLinkPush = function (link) {
  var valor = String(link || "").trim();
  if (!valor || valor.charAt(0) !== "/" || valor.charAt(1) === "/" || valor.indexOf("\\") !== -1) {
    return "/dashboard";
  }
  if (/[\u0000-\u001f\u007f]/.test(valor)) return "/dashboard";
  try {
    var url = new URL(valor, "https://sghr.local");
    if (url.origin !== "https://sghr.local") return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch (e) {
    return "/dashboard";
  }
};

var validarSubscricaoPush = function (entrada) {
  if (!entrada || typeof entrada !== "object") {
    return { erro: "Subscricao de notificacoes invalida" };
  }

  var endpoint = String(entrada.endpoint || "").trim();
  if (!endpoint || endpoint.length > 2048) {
    return { erro: "Endpoint de notificacoes invalido" };
  }
  try {
    var url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) {
      return { erro: "O endpoint tem de ser um endereco HTTPS valido" };
    }
  } catch (e) {
    return { erro: "O endpoint tem de ser um endereco HTTPS valido" };
  }

  var chaves = entrada.keys;
  if (!chaves || typeof chaves !== "object") {
    return { erro: "Chaves da subscricao em falta" };
  }

  var p256dh = decodificarBase64url(chaves.p256dh);
  var auth = decodificarBase64url(chaves.auth);
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 4) {
    return { erro: "Chave p256dh invalida" };
  }
  if (!auth || auth.length !== 16) {
    return { erro: "Chave de autenticacao invalida" };
  }

  return {
    valor: {
      endpoint: endpoint,
      endpoint_hash: hashEndpoint(endpoint),
      p256dh: chaves.p256dh,
      auth: chaves.auth,
      user_agent: String(entrada.user_agent || "").slice(0, 500),
    },
  };
};

var montarPayloadPush = function (notificacao) {
  var titulo = String(notificacao.titulo || "Nova notificacao").trim().slice(0, 120) || "Nova notificacao";
  var mensagem = String(notificacao.mensagem || "").trim().slice(0, 240);
  var id = notificacao.id ? String(notificacao.id) : crypto.randomUUID();

  return {
    titulo: titulo,
    mensagem: mensagem,
    icone: "/icon-192.png",
    insignia: "/icon-192.png",
    tag: "sghr-notificacao-" + id,
    dados: {
      notificacao_id: id,
      url: normalizarLinkPush(notificacao.link),
      tipo: notificacao.tipo || "info",
      modulo: notificacao.modulo || null,
    },
  };
};

var derivarChavesDoSegredo = function (segredo) {
  if (!segredo || String(segredo).length < 32) return null;
  var material = crypto.createHmac("sha256", String(segredo))
    .update("SGHR|Web Push|VAPID|v1")
    .digest();

  // Reduzir para um escalar valido da curva P-256.
  var escalar = BigInt("0x" + material.toString("hex")) % ORDEM_P256;
  if (escalar === 0n) escalar = 1n;
  var privada = Buffer.from(escalar.toString(16).padStart(64, "0"), "hex");
  var ecdh = crypto.createECDH("prime256v1");
  ecdh.setPrivateKey(privada);

  return {
    chave_publica: base64url(ecdh.getPublicKey(undefined, "uncompressed")),
    chave_privada: base64url(privada),
  };
};

var parDeChavesValido = function (publica, privada) {
  try {
    var material = decodificarBase64url(privada);
    if (!material || material.length !== 32) return false;
    var ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(material);
    return base64url(ecdh.getPublicKey(undefined, "uncompressed")) === String(publica).replace(/=+$/g, "");
  } catch (e) {
    return false;
  }
};

// Em producao o recomendado e definir VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY.
// Quando essas variaveis nao existem, derivamos um par estavel e separado por
// dominio a partir do SECRET que o servidor ja usa. Assim o push funciona sem
// expor a chave privada no Git; mudar o SECRET obriga a reactivar os aparelhos.
var obterConfiguracaoVapid = function (ambiente) {
  var env = ambiente || process.env;
  var publica = String(env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
  var privada = String(env.VAPID_PRIVATE_KEY || "").trim();
  var assunto = String(env.VAPID_SUBJECT || "").trim();
  if (!/^(mailto:|https:\/\/)/i.test(assunto)) assunto = ASSUNTO_PADRAO;

  if (publica || privada) {
    if (!publica || !privada || !parDeChavesValido(publica, privada)) return null;
    return { assunto: assunto, chave_publica: publica, chave_privada: privada };
  }

  var derivadas = derivarChavesDoSegredo(env.SECRET);
  if (!derivadas) return null;
  return {
    assunto: assunto,
    chave_publica: derivadas.chave_publica,
    chave_privada: derivadas.chave_privada,
  };
};

var assinaturaWebPush = function (subscricao) {
  if (!subscricao || typeof subscricao !== "object") {
    throw new Error("Subscricao push invalida");
  }

  var endpoint = String(subscricao.endpoint || "").trim();
  var p256dh = String(subscricao.p256dh || "").trim();
  var auth = String(subscricao.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Subscricao push sem chaves");
  }

  return {
    endpoint: endpoint,
    keys: { p256dh: p256dh, auth: auth },
  };
};

var enviarPushNotificacao = async function (notificacao, dependencias) {
  var deps = dependencias || {};
  if (!notificacao || !notificacao.utilizador_id || !notificacao.organizacao_id) {
    return { encontradas: 0, enviadas: 0, removidas: 0, falhas: 0 };
  }

  var config = obterConfiguracaoVapid();
  if (!config) return { encontradas: 0, enviadas: 0, removidas: 0, falhas: 0 };

  try {
    var Model = deps.modelo || require("../models").NotificacaoPush;
    var webpush = deps.webpush || require("web-push");
    if (webpush && typeof webpush.setVapidDetails === "function") {
      webpush.setVapidDetails(config.assunto, config.chave_publica, config.chave_privada);
    }

    var subscricoes = await Model.findAll({
      where: {
        organizacao_id: notificacao.organizacao_id,
        utilizador_id: notificacao.utilizador_id,
        ativo: true,
      },
      limit: 20,
    });

    var resultado = { encontradas: subscricoes.length, enviadas: 0, removidas: 0, falhas: 0 };
    if (!subscricoes.length) return resultado;

    var payload = JSON.stringify(montarPayloadPush(notificacao));
    var urgencia = notificacao.tipo === "error" || notificacao.tipo === "warning" ? "high" : "normal";

    await Promise.all(subscricoes.map(async function (subscricao) {
      try {
        await webpush.sendNotification(assinaturaWebPush(subscricao), payload, {
          TTL: 86400,
          urgency: urgencia,
        });
        resultado.enviadas += 1;
        if (subscricao && typeof subscricao.update === "function") {
          await subscricao.update({ ultimo_envio: new Date() });
        }
      } catch (erro) {
        resultado.falhas += 1;
        var status = Number(erro && erro.statusCode) || 0;
        if (status === 404 || status === 410) {
          try {
            await Model.destroy({ where: { id: subscricao.id } });
            resultado.removidas += 1;
          } catch (erroRemover) {
            console.log("Aviso: nao foi possivel remover subscricao push invalida");
          }
        } else {
          console.log("Erro ao enviar push (status " + (status || "desconhecido") + "): " + String(erro && erro.message || "erro").slice(0, 180));
        }
      }
    }));

    return resultado;
  } catch (erro) {
    // Uma falha no push nunca deve impedir a criacao da notificacao no site.
    console.log("Erro no servico de push: " + String(erro && erro.message || "erro").slice(0, 180));
    return { encontradas: 0, enviadas: 0, removidas: 0, falhas: 0 };
  }
};

module.exports = {
  base64url,
  decodificarBase64url,
  hashEndpoint,
  normalizarLinkPush,
  validarSubscricaoPush,
  montarPayloadPush,
  obterConfiguracaoVapid,
  assinaturaWebPush,
  enviarPushNotificacao,
};
