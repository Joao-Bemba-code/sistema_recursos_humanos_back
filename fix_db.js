var mysql = require('mysql2/promise');
var bcrypt = require('bcryptjs');

var OLD = {
  host: '127.0.0.1',
  user: 'sigraf_app',
  password: 'Sgrf2026!Lcl',
  database: 'srh',
  port: 3306,
};
var NEW = {
  host: '127.0.0.1',
  user: 'sigraf_app',
  password: 'Sgrf2026!Lcl',
  database: 'srh',
  port: 3306,
};

function dataDiaria(v) {
  var s = String(v);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var d = new Date(s);
  if (isNaN(d.getTime())) return null;
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

(async () => {
  var oldConn = await mysql.createConnection(OLD);
  var newConn = await mysql.createConnection(NEW);

  console.log("=== 1. CORRIGIR DATAS DE registos_presenca ===");
  var [oldRows] = await oldConn.query("SELECT id, data, createdAt, hora_entrada, hora_saida, estado, justificado FROM registos_presenca");
  var corrigidas = 0;
  for (var i = 0; i < oldRows.length; i++) {
    var o = oldRows[i];
    var [nr] = await newConn.query("SELECT data, createdAt, hora_entrada, hora_saida, estado, justificado FROM registos_presenca WHERE id = ?", [o.id]);
    if (nr.length === 0) { console.log("  faltante na nova: " + o.id); continue; }
    var n = nr[0];
    var dataOld = dataDiaria(o.data);
    var dataNew = dataDiaria(n.data);
    var changed = false;
    var sets = [];
    if (dataOld && dataOld !== dataNew) { sets.push("data = '" + dataOld + "'"); changed = true; }
    if (String(n.hora_entrada || '') !== String(o.hora_entrada || '')) { sets.push("hora_entrada = " + (o.hora_entrada ? "'" + o.hora_entrada + "'" : "NULL")); changed = true; }
    if (String(n.hora_saida || '') !== String(o.hora_saida || '')) { sets.push("hora_saida = " + (o.hora_saida ? "'" + o.hora_saida + "'" : "NULL")); changed = true; }
    if (String(n.estado || '') !== String(o.estado || '')) { sets.push("estado = '" + o.estado + "'"); changed = true; }
    if (String(n.justificado || '') !== String(o.justificado || '')) { sets.push("justificado = " + (o.justificado ? "1" : "0")); changed = true; }
    if (changed) {
      await newConn.query("UPDATE registos_presenca SET " + sets.join(", ") + " WHERE id = ?", [o.id]);
      corrigidas++;
      console.log("  corrigido " + o.id + " [" + sets.join(", ") + "]");
    }
  }
  console.log("  correcoes aplicadas: " + corrigidas);

  console.log("\n=== 2. REPOR SENHA admin123 NO BANCO LOCAL ===");
  var salt = await bcrypt.genSalt(12);
  var hashedPassword = await bcrypt.hash('admin123', salt);
  var [result] = await newConn.query(
    "UPDATE utilizadores SET password = ?, must_change_password = 1, tentativas_login = 0, bloqueado = 0 WHERE email = 'admin@cenffor.co.ao'",
    [hashedPassword]
  );
  var [check] = await newConn.query("SELECT email, tentativas_login, bloqueado, password FROM utilizadores WHERE email = 'admin@cenffor.co.ao'");
  console.log("  linhas atualizadas: " + result.affectedRows);
  console.log("  match admin123:", await bcrypt.compare('admin123', check[0].password), "| tentativas:", check[0].tentativas_login, "| bloqueado:", check[0].bloqueado);

  console.log("\n=== 3. VERIFICAR DUPLICADOS ===");
  var [dups] = await newConn.query("SELECT colaborador_id, data, COUNT(*) as cnt FROM registos_presenca GROUP BY colaborador_id, data HAVING cnt > 1");
  console.log("  duplicados restantes: " + dups.length);

  await oldConn.end();
  await newConn.end();
  console.log("\nConcluido!");
})().catch(function (e) { console.error("Erro:", e.message); process.exit(1); });