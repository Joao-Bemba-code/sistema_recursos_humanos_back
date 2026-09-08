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
  var conns = {};
  for (var n of ['OLD', 'NEW']) conns[n] = await mysql.createConnection(CONFS[n]);
  var [oldTab] = await conns.OLD.query("SHOW TABLES");
  var key = Object.keys(oldTab[0])[0];
  var tabs = oldTab.map(function (t) { return t[key]; });
  var diffs = [];
  for (var t of tabs) {
    var [o] = await conns.OLD.query("SELECT COUNT(*) as c FROM `" + t + "`");
    var [n2] = await conns.NEW.query("SELECT COUNT(*) as c FROM `" + t + "`");
    var s = o[0].c === n2[0].c ? "igual" : "DIF antiga=" + o[0].c + " nova=" + n2[0].c;
    console.log(t + ": " + s);
    if (o[0].c !== n2[0].c) diffs.push(t);
  }
  console.log(diffs.length === 0 ? "\nTudo igual em todas as tabelas!" : "\nDIFERENCAS em: " + diffs.join(", "));
  for (var n of ['OLD', 'NEW']) await conns[n].end();
})();