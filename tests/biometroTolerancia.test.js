var test = require("node:test");
var assert = require("node:assert/strict");
var {
  paraMinutos,
  classificarEstado,
  observacaoAutomatica,
  TOLERANCIA_MINUTOS,
} = require("../controllers/biometroController");

var iso = function (d) {
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
};

// Ontem para o dia nunca cair no estado provisório "Em_Curso".
var ontem = new Date();
ontem.setDate(ontem.getDate() - 1);
var DATA = iso(ontem);
var HOJE = iso(new Date());

var escalaPadrao = { entrada: "08:00", saida: "16:00" };
var escalaPropria = { entrada: "09:00", saida: "17:00" };

test("a tolerância de entrada é de 15 minutos", function () {
  assert.equal(TOLERANCIA_MINUTOS, 15);
});

test("08:00 e 08:15 contam como Presente; 08:16 já conta como Atrasado", function () {
  assert.equal(classificarEstado("08:00", true, DATA, escalaPadrao), "Presente");
  assert.equal(classificarEstado("08:15", true, DATA, escalaPadrao), "Presente");
  assert.equal(classificarEstado("08:16", true, DATA, escalaPadrao), "Atrasado");
  assert.equal(classificarEstado("08:20", true, DATA, escalaPadrao), "Atrasado");
});

test("exemplo 08:20: 5 min de atraso após a tolerância e saída esperada 16:20", function () {
  var obs = observacaoAutomatica("08:20", true, DATA, escalaPadrao);
  assert.match(obs, /Atraso de 5 min/);
  assert.match(obs, /saída esperada 16:20/);
  assert.equal(paraMinutos("08:20"), 500);
});

test("a regra usa a escala do próprio colaborador quando existe", function () {
  assert.equal(classificarEstado("09:15", true, DATA, escalaPropria), "Presente");
  assert.equal(classificarEstado("09:16", true, DATA, escalaPropria), "Atrasado");
  var obs = observacaoAutomatica("09:20", true, DATA, escalaPropria);
  assert.match(obs, /Atraso de 5 min/);
  assert.match(obs, /saída esperada 17:20/);
});

test("sem entrada é Ausente e o dia de hoje sem saída fica Em_Curso", function () {
  assert.equal(classificarEstado(null, false, DATA, escalaPadrao), "Ausente");
  assert.equal(classificarEstado("08:20", false, HOJE, escalaPadrao), "Em_Curso");
});
