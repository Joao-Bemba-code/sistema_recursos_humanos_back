var test = require("node:test");
var assert = require("node:assert/strict");
var {
  atribuirHorarios,
  atribuirAlmoco,
  calcularHorasTrabalhadas,
  HORARIO_SAIDA_ALMOCO,
  HORARIO_ENTRADA_ALMOCO,
} = require("../controllers/biometroController");

var DATA = "2026-11-28";
var escalaPadrao = { entrada: "08:00", saida: "16:00" };

// Picagens como a ponte envia: ordenadas, com hora HH:MM:SS e data local.
var picagens = function (horas) {
  return horas.map(function (h) {
    var partes = h.split(":");
    return {
      hora: h + ":00",
      tipo: 1,
      dataStr: DATA,
      ts: new Date(2026, 10, 28, parseInt(partes[0], 10), parseInt(partes[1], 10), 0),
    };
  });
};

test("horario do almoco por omissao e 12:00 / 13:00", function () {
  assert.equal(HORARIO_SAIDA_ALMOCO, "12:00");
  assert.equal(HORARIO_ENTRADA_ALMOCO, "13:00");
});

test("4 picagens (08/12/13/16) preenchem entrada, almoco e saida", function () {
  var r = atribuirHorarios(null, null, picagens(["08:00", "12:00", "13:00", "16:00"]), escalaPadrao, DATA);
  assert.equal(r.entrada, "08:00:00");
  assert.equal(r.saida, "16:00:00");
  assert.equal(r.saida_almoco, "12:00:00");
  assert.equal(r.entrada_almoco, "13:00:00");
  // O almoco NAO e descontado: a jornada continua a ser 08:00 -> 16:00.
  assert.equal(calcularHorasTrabalhadas(r.entrada, r.saida), 8);
});

test("2 picagens mantem o comportamento anterior (sem almoco)", function () {
  var r = atribuirHorarios(null, null, picagens(["08:00", "16:00"]), escalaPadrao, DATA);
  assert.equal(r.entrada, "08:00:00");
  assert.equal(r.saida, "16:00:00");
  assert.equal(r.saida_almoco, null);
  assert.equal(r.entrada_almoco, null);
  assert.equal(calcularHorasTrabalhadas(r.entrada, r.saida), 8);
});

test("3 picagens (08/12/16) gravam so a saida para o almoco", function () {
  var r = atribuirHorarios(null, null, picagens(["08:00", "12:00", "16:00"]), escalaPadrao, DATA);
  assert.equal(r.saida, "16:00:00");
  assert.equal(r.saida_almoco, "12:00:00");
  assert.equal(r.entrada_almoco, null);
});

test("picagens com atraso gravam as horas reais do almoco", function () {
  var r = atribuirHorarios(null, null, picagens(["08:10", "12:07", "13:12", "16:05"]), escalaPadrao, DATA);
  assert.equal(r.saida_almoco, "12:07:00");
  assert.equal(r.entrada_almoco, "13:12:00");
  assert.equal(r.saida, "16:05:00");
});

test("se nao ha picagens novas, os horarios do almoco ja gravados sao preservados", function () {
  var r = atribuirHorarios(
    "08:00:00", "16:00:00", picagens(["08:00", "16:00"]), escalaPadrao, DATA, "11:55:00", "13:05:00"
  );
  assert.equal(r.saida_almoco, "11:55:00");
  assert.equal(r.entrada_almoco, "13:05:00");
});

test("uma picagem isolada perto das 13:00 e a volta do almoco", function () {
  var r = atribuirAlmoco("08:00:00", "16:00:00", picagens(["13:02"]), escalaPadrao, DATA, 0, null, null);
  assert.equal(r.saida_almoco, null);
  assert.equal(r.entrada_almoco, "13:02:00");
});

test("turno nocturno nao recebe horario de almoco automatico", function () {
  var escalaNocturna = { entrada: "20:00", saida: "04:00" };
  var r = atribuirAlmoco("20:00:00", "04:00:00", picagens(["00:00", "02:00"]), escalaNocturna, DATA, 1440, null, null);
  assert.equal(r.saida_almoco, null);
  assert.equal(r.entrada_almoco, null);
});
