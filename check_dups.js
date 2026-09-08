var mysql = require('mysql2/promise');

var CONFS = {
  OLD: {
    host: '127.0.0.1',
    user: 'sigraf_app',
    password: 'Sgrf2026!Lcl',
    database: 'srh',
    port: 3306,
  },
  NEW: {
    host: '127.0.0.1',
    user: 'sigraf_app',
    password: 'Sgrf2026!Lcl',
    database: 'srh',
    port: 3306,
  },
};

(async () => {
  var col = '9ea4d1d7-e80c-4109-aaa4-0cd3cf3da7b7';
  for (var nome of ['OLD', 'NEW']) {
    var conn = await mysql.createConnection(CONFS[nome]);
    var [rows] = await conn.query(
      "SELECT id, colaborador_id, data, hora_entrada, hora_saida, estado, justificado, createdAt, updatedAt FROM registos_presenca WHERE colaborador_id = ? ORDER BY data",
      [col]
    );
    console.log("=" + nome + "= (" + rows.length + " registos)");
    rows.forEach(function (r) {
      console.log("  id=" + r.id + " data=" + r.data + " entrada=" + r.hora_entrada + " saida=" + r.hora_saida + " estado=" + r.estado + " just=" + r.justificado + " created=" + r.createdAt);
    });
    await conn.end();
  }
})();