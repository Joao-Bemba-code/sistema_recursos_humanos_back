var mysql = require('mysql2/promise');

var NEW = {
  host: '127.0.0.1',
  user: 'sigraf_app',
  password: 'Sgrf2026!Lcl',
  database: 'srh',
  port: 3306,
};

var OLD = {
  host: '127.0.0.1',
  user: 'sigraf_app',
  password: 'Sgrf2026!Lcl',
  database: 'srh',
  port: 3306,
};

(async () => {
  var c = await mysql.createConnection(NEW);
  console.log("=== REGISTOS COM ESTADO Ausente/Atrasado (LOCAL) ===");
  var [rows] = await c.query(
    "SELECT id, colaborador_id, data, hora_entrada, estado, justificado, observacoes FROM registos_presenca WHERE estado IN ('Ausente','Atrasado') ORDER BY data DESC"
  );
  rows.forEach(function (r) {
    console.log("  col=" + r.colaborador_id + " data=" + String(r.data).slice(0,10) + " est=" + r.estado + " just=" + r.justificado + " | typed=" + typeof r.justificado);
  });
  console.log("total: " + rows.length);
  await c.end();

  console.log("\n=== CONTRASTES DE SALARIO (contratos) ===");
  var c2 = await mysql.createConnection(NEW);
  var [contratos] = await c2.query("SELECT colaborador_id, salario_base, estado FROM contratos");
  contratos.forEach(function (x) { console.log("  col=" + x.colaborador_id + " base=" + x.salario_base + " estado=" + x.estado); });
  await c2.end();

  console.log("\n=== QUAL colaborador corresponde a estas faltas? (nomes) ===");
  var c3 = await mysql.createConnection(NEW);
  var [cols] = await c3.query("SELECT id, nome_completo, numero_colaborador FROM colaboradores");
  cols.forEach(function (x) { console.log("  " + x.id + " | " + x.nome_completo + " | " + x.numero_colaborador); });
  await c3.end();
})();