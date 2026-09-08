var mysql = require('mysql2/promise');

var NEW = {
  host: '127.0.0.1',
  user: 'sigraf_app',
  password: 'Sgrf2026!Lcl',
  database: 'srh',
  port: 3306,
};

function calc(faltas, salarioBase) {
  var salarioDiario = salarioBase / 30;
  var salarioHora = salarioDiario / 8;
  var horas = 0, nF = 0, nA = 0;
  faltas.forEach(function (f) {
    if (f.estado === 'Ausente') { horas += 8; nF++; }
    else if (f.estado === 'Atrasado') {
      nA++;
      if (f.hora_entrada) {
        var p = f.hora_entrada.split(':');
        var mins = parseInt(p[0]) * 60 + parseInt(p[1]);
        if (mins > 480) horas += (mins - 480) / 60;
      }
    }
  });
  return { faltas: nF, atrasos: nA, horas: Math.round(horas * 100) / 100, valor: Math.round(horas * salarioHora * 100) / 100, salarioDiario: Math.round(salarioDiario * 100) / 100 };
}

(async () => {
  var c = await mysql.createConnection(NEW);
  for (var col of ['75717e7a-88f3-4f5a-bc50-e3c746e39533', '9ea4d1d7-e80c-4109-aaa4-0cd3cf3da7b7']) {
    var [faltas] = await c.query("SELECT estado, hora_entrada FROM registos_presenca WHERE colaborador_id = ? AND estado IN ('Ausente','Atrasado') AND justificado = 0", [col]);
    var [ct] = await c.query("SELECT salario_base FROM contratos WHERE colaborador_id = ? AND estado = 'Activo'", [col]);
    var base = ct.length ? parseFloat(ct[0].salario_base) : 0;
    var r = calc(faltas, base);
    console.log(col + " -> faltas=" + r.faltas + " atrasos=" + r.atrasos + " horas=" + r.horas + " salarioDiario=" + r.salarioDiario + " VALOR=" + r.valor);
  }
  await c.end();
})();