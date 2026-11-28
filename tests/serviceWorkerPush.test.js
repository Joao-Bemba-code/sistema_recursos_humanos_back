var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

function carregarServiceWorker() {
  var eventos = {};
  var notificacoes = [];
  var abertas = [];
  var selfFalso = {
    location: { origin: "https://kamgest-srh.com" },
    clients: {
      claim: async function () {},
      matchAll: async function () { return []; },
      openWindow: async function (url) { abertas.push(url); return {}; },
    },
    registration: {
      showNotification: async function (titulo, opcoes) { notificacoes.push({ titulo: titulo, opcoes: opcoes }); },
    },
    addEventListener: function (nome, handler) { eventos[nome] = handler; },
  };

  var ficheiro = path.resolve(__dirname, "../../sistema_recursos_humanos_front/public/sw.js");
  vm.runInNewContext(fs.readFileSync(ficheiro, "utf8"), {
    self: selfFalso,
    URL: URL,
    Date: Date,
    console: console,
  }, { filename: ficheiro });

  return { eventos: eventos, notificacoes: notificacoes, abertas: abertas, self: selfFalso };
}

test("service worker mostra o push com titulo, mensagem e link seguro", async function () {
  var sw = carregarServiceWorker();
  var promessa;
  sw.eventos.push({
    data: {
      json: function () {
        return {
          titulo: "Nova Tarefa",
          mensagem: "Tem uma tarefa atribuida",
          tag: "sghr-notificacao-123",
          icone: "/icon-192.png",
          insignia: "/icon-192.png",
          dados: { notificacao_id: "123", url: "https://site-externo.exemplo", tipo: "info" },
        };
      },
    },
    waitUntil: function (p) { promessa = p; },
  });

  await promessa;
  assert.equal(sw.notificacoes.length, 1);
  assert.equal(sw.notificacoes[0].titulo, "Nova Tarefa");
  assert.equal(sw.notificacoes[0].opcoes.body, "Tem uma tarefa atribuida");
  assert.equal(sw.notificacoes[0].opcoes.data.url, "/dashboard");
  assert.equal(sw.notificacoes[0].opcoes.tag, "sghr-notificacao-123");
});

test("click na notificacao abre uma janela com o destino interno", async function () {
  var sw = carregarServiceWorker();
  var promessa;
  sw.eventos.notificationclick({
    notification: {
      close: function () {},
      data: { url: "/dashboard/tarefas?estado=aberta" },
    },
    waitUntil: function (p) { promessa = p; },
  });

  await promessa;
  assert.deepEqual(sw.abertas, ["/dashboard/tarefas?estado=aberta"]);
});

test("click reutiliza uma janela existente do SGHR", async function () {
  var sw = carregarServiceWorker();
  var navegacoes = [];
  var focos = 0;
  sw.self.clients.matchAll = async function () {
    return [{
      url: "https://kamgest-srh.com/dashboard",
      navigate: async function (url) { navegacoes.push(url); },
      focus: async function () { focos += 1; },
    }];
  };
  var promessa;
  sw.eventos.notificationclick({
    notification: { close: function () {}, data: { url: "/dashboard/formacao" } },
    waitUntil: function (p) { promessa = p; },
  });

  await promessa;
  assert.deepEqual(navegacoes, ["/dashboard/formacao"]);
  assert.equal(focos, 1);
  assert.equal(sw.abertas.length, 0);
});
