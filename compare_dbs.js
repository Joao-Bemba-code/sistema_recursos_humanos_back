var dotenv = require('dotenv');
dotenv.config({path: __dirname + '/.env'});

var fs = require('fs');
var path = require('path');
var mysql = require('mysql2/promise');

var OLD_CONFIG = {
    host: process.env.Host_database,
    user: process.env.User_database,
    password: process.env.Pass_database,
    database: process.env.Name_database,
    port: parseInt(process.env.Port_database) || 3306,
};

var NEW_CONFIG = {
    host: '127.0.0.1',
    user: 'sigraf_app',
    password: 'Sgrf2026!Lcl',
    database: 'srh',
    port: 3306,
};

function escapeValue(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'boolean') return val ? '1' : '0';
    if (typeof val === 'number') return String(val);
    if (val instanceof Date) return "'" + val.toISOString().slice(0, 19).replace('T', ' ') + "'";
    if (Buffer.isBuffer(val)) return "X'" + val.toString('hex') + "'";
    var str = String(val);
    str = str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');
    return "'" + str + "'";
}

(async () => {
    try {
        var oldConn = await mysql.createConnection(OLD_CONFIG);
        console.log("Ligado a BD antiga (SkySQL)!");
        var newConn = await mysql.createConnection(NEW_CONFIG);
        console.log("Ligado a BD nova (TiDB)!");

        var [oldTables] = await oldConn.query("SHOW TABLES");
        var oldKey = Object.keys(oldTables[0])[0];
        var tableNames = oldTables.map(function(t) { return t[oldKey]; });

        console.log("\n=== COMPARACAO DE DADOS ===");
        var tablesWithNewData = [];

        for (var i = 0; i < tableNames.length; i++) {
            var table = tableNames[i];
            try {
                var [oldCount] = await oldConn.query("SELECT COUNT(*) as total FROM `" + table + "`");
                var [newCount] = await newConn.query("SELECT COUNT(*) as total FROM `" + table + "`");
                var oldN = oldCount[0].total;
                var newN = newCount[0].total;
                var diff = oldN - newN;
                var status = diff > 0 ? "NOVOS: +" + diff : diff === 0 ? "igual" : "EXTRA na nova: " + Math.abs(diff);
                console.log(table + ": antiga=" + oldN + " nova=" + newN + " -> " + status);
                if (diff > 0) tablesWithNewData.push({ table: table, oldCount: oldN, newCount: newN, diff: diff });
            } catch (e) {
                console.log(table + ": ERRO - " + e.message);
            }
        }

        console.log("\n=== TABELAS COM DADOS NOVOS ===");
        if (tablesWithNewData.length === 0) {
            console.log("Nenhum dado novo encontrado. Tudo igual!");
        } else {
            tablesWithNewData.forEach(function(t) {
                console.log(t.table + ": " + t.diff + " novos registos");
            });
        }

        await oldConn.end();
        await newConn.end();
    } catch (e) {
        console.error("Erro:", e.message);
        process.exit(1);
    }
})();