var test = require("node:test");
var assert = require("node:assert/strict");
var crypto = require("crypto");
var webpush = require("web-push");
var {
  base64url,
  hashEndpoint,
  normalizarLinkPush,
  validarSubscricaoPush,
  montarPayloadPush,
  obterConfiguracaoVapid,
  assinaturaWebPush,
  enviarPushNotificacao,
} = require("../helpers/notificacaoPush");

function subscricaoValida(endpoint) {
  var ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    endpoint: endpoint || "https://fcm.googleapis.com/fcm/send/exemplo",
    keys: {
      p256dh: base64url(ecdh.getPublicKey(undefined, "uncompressed")),
      auth: base64url(crypto.randomBytes(16)),
    },
    user_agent: "Mozilla/5.0",
  };
}

test("validacao aceita uma subscricao real e rejeita endpoints/chaves invalidas", function () {
  var entrada = subscricaoValida();
  var resultado = validarSubscricaoPush(entrada);
  assert.equal(resultado.erro, undefined);
  assert.equal(resultado.valor.endpoint, entrada.endpoint);
  assert.equal(resultado.valor.endpoint_hash, hashEndpoint(entrada.endpoint));
  assert.match(validarSubscricaoPush({ endpoint: "http://inseguro.exemplo", keys: entrada.keys }).erro, /HTTPS/);
  assert.match(validarSubscricaoPush({ endpoint: entrada.endpoint, keys: { p256dh: "abc", auth: "abc" } }).erro, /p256dh/);
  assert.match(validarSubscricaoPush(null).erro, /invalida/);
  assert.match(validarSubscricaoPush({ endpoint: entrada.endpoint }).erro, /Chaves/);
  assert.throws(function () { assinaturaWebPush(null); }, /invalida/);
  assert.throws(function () { assinaturaWebPush({ endpoint: entrada.endpoint }); }, /sem chaves/);
  assert.deepEqual(assinaturaWebPush({ endpoint: entrada.endpoint, p256dh: entrada.keys.p256dh, auth: entrada.keys.auth }), {
    endpoint: entrada.endpoint,
    keys: entrada.keys,
  });
});

test("payload limpa o texto e so abre links internos", function () {
  var payload = montarPayloadPush({
    id: "notif-1",
    titulo: "Nova tarefa",
    mensagem: "Foi atribuida uma tarefa",
    link: "https://site-externo.exemplo/roubo",
    tipo: "warning",
    modulo: "tarefas",
  });
  assert.equal(payload.dados.url, "/dashboard");
  assert.equal(payload.tag, "sghr-notificacao-notif-1");
  assert.equal(normalizarLinkPush("/dashboard/tarefas?estado=aberta#lista"), "/dashboard/tarefas?estado=aberta#lista");
  assert.equal(normalizarLinkPush("//site-externo.exemplo"), "/dashboard");
});

test("VAPID e derivado de forma estavel e produz um pedido web push valido", async function () {
  var ambiente = { SECRET: "segredo-de-teste-com-mais-de-32-caracteres" };
  var primeira = obterConfiguracaoVapid(ambiente);
  var segunda = obterConfiguracaoVapid(ambiente);
  assert.ok(primeira && segunda);
  assert.equal(primeira.chave_publica, segunda.chave_publica);
  assert.equal(primeira.chave_privada, segunda.chave_privada);
  assert.match(primeira.assunto, /^mailto:/);

  webpush.setVapidDetails(primeira.assunto, primeira.chave_publica, primeira.chave_privada);
  var subscricao = subscricaoValida();
  var pedido = webpush.generateRequestDetails(subscricao, JSON.stringify({ titulo: "Teste" }), { TTL: 60 });
  assert.equal(pedido.endpoint, subscricao.endpoint);
  var chaveAutorizacao = Object.keys(pedido.headers).find(function (chave) {
    return chave.toLowerCase() === "authorization";
  });
  assert.ok(chaveAutorizacao);
  assert.match(pedido.headers[chaveAutorizacao], /^vapid\s+t=/i);
  assert.ok(pedido.body && pedido.body.length > 0);
});

test("servico envia para todos os dispositivos e remove subscricoes 404/410", async function () {
  var segredoAnterior = process.env.SECRET;
  process.env.SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
  var envios = [];
  var removidos = [];
  var actualizados = [];
  var modelo = {
    findAll: async function () {
      return [
        { id: "1", endpoint: "https://push.exemplo/1", p256dh: "p1", auth: "a1", update: async function (dados) { actualizados.push(dados); } },
        { id: "2", endpoint: "https://push.exemplo/2", p256dh: "p2", auth: "a2", update: async function () {} },
        { id: "3", endpoint: "https://push.exemplo/3", p256dh: "p3", auth: "a3", update: async function () {} },
      ];
    },
    destroy: async function (opcoes) { removidos.push(opcoes.where.id); return 1; },
  };
  var cliente = {
    setVapidDetails: function () {},
    sendNotification: async function (subscricao, payload, opcoes) {
      envios.push({ subscricao: subscricao, payload: JSON.parse(payload), opcoes: opcoes });
      if (subscricao.endpoint.indexOf("/2") !== -1) {
        var erro = new Error("Gone"); erro.statusCode = 410; throw erro;
      }
      if (subscricao.endpoint.indexOf("/3") !== -1) {
        var erroOutro = new Error("Indisponivel"); erroOutro.statusCode = 503; throw erroOutro;
      }
    },
  };

  try {
    var resultado = await enviarPushNotificacao({
      id: "n1",
      organizacao_id: "org1",
      utilizador_id: "user1",
      titulo: "Aviso",
      mensagem: "Mensagem",
      tipo: "error",
      link: "/dashboard/tarefas",
    }, { modelo: modelo, webpush: cliente });

    assert.deepEqual(resultado, { encontradas: 3, enviadas: 1, removidas: 1, falhas: 2 });
    assert.equal(envios.length, 3);
    assert.equal(envios[0].payload.dados.url, "/dashboard/tarefas");
    assert.equal(envios[0].opcoes.urgency, "high");
    assert.deepEqual(removidos, ["2"]);
    assert.equal(actualizados.length, 1);
    assert.ok(actualizados[0].ultimo_envio instanceof Date);
  } finally {
    if (segredoAnterior === undefined) delete process.env.SECRET;
    else process.env.SECRET = segredoAnterior;
  }
});

test("sem VAPID ou sem destinatario o servico nao consulta a base", async function () {
  var consultou = false;
  var resultado = await enviarPushNotificacao({ organizacao_id: "org1", utilizador_id: "user1" }, {
    modelo: { findAll: async function () { consultou = true; return []; } },
    webpush: {},
  });
  assert.equal(resultado.encontradas, 0);
  assert.equal(consultou, false);
});
