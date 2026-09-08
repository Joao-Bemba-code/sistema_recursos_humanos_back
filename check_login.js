var dotenv = require('dotenv');
dotenv.config({ path: __dirname + '/.env' });
var mysql = require('mysql2/promise');
var bcrypt = require('bcryptjs');

var OLD_CONFIG = {
  host: process.env.Host_database,
  user: process.env.User_database,
  password: process.env.Pass_database,
  database: process.env.Name_database,
  port: parseInt(process.env.Port_database) || 3306,
};

var CAMINHOS = {
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
  for (var nome of ['OLD', 'NEW']) {
    try {
      var conn = await mysql.createConnection(CAMINHOS[nome]);
      var [rows] = await conn.query("SELECT email, password, must_change_password, tentativas_login, bloqueado FROM utilizadores WHERE email = 'admin@cenffor.co.ao'");
      var h = rows[0] ? rows[0].password : null;
      var match = h ? await bcrypt.compare('admin123', h) : null;
      console.log("=" + nome + "=");
      console.log("  hash:", h);
      console.log("  match admin123:", match);
      console.log("  must_change_password:", rows[0] ? rows[0].must_change_password : null, "| tentativas:", rows[0] ? rows[0].tentativas_login : null, "| bloqueado:", rows[0] ? rows[0].bloqueado : null);
      await conn.end();
    } catch (e) {
      console.log("=" + nome + "= ERRO: " + e.message);
    }
  }
})();