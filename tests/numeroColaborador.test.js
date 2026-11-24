var test = require("node:test");
var assert = require("node:assert/strict");
var { proximoNumeroColaborador } = require("../helpers/numeroColaborador");

test("primeira organização Sem colaboradores começa em COL-00001", function () {
  assert.equal(proximoNumeroColaborador([]), "COL-00001");
  assert.equal(proximoNumeroColaborador(null), "COL-00001");
});

test("numeração continua a partir do maior número usado em qualquer organização", function () {
  var numeros = ["COL-00001", "COL-00018", "COL-00019", "COL001"];
  // COL001 e lexicograficamente maior, mas o sufixo numerico e 1.
  assert.equal(proximoNumeroColaborador(numeros), "COL-00020");
});

test("ignora valores sem numero e preenche com zeros", function () {
  assert.equal(proximoNumeroColaborador(["COL-SEM-NUMERO", "", null, "7"]), "COL-00008");
  assert.equal(proximoNumeroColaborador(["COL-99999"]), "COL-100000");
});
