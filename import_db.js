var fs = require('fs');
var path = require('path');
var mysql = require('mysql2/promise');

var HOST = '127.0.0.1';
var USER = 'sigraf_app';
var PASS = 'Sgrf2026!Lcl';
var PORT = 3306;
var NOVA_BD = process.argv[2] || 'srh';

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

function getCreateTableSQL(tableName, columns) {
    var lines = columns.map(function(c) {
        var line = '  `' + c.Field + '` ' + c.Type;
        if (c.Null === 'NO') line += ' NOT NULL';
        if (c.Default !== null && c.Default !== undefined) {
            if (c.Default === 'CURRENT_TIMESTAMP') {
                line += ' DEFAULT CURRENT_TIMESTAMP';
            } else {
                line += ' DEFAULT ' + escapeValue(c.Default);
            }
        }
        if (c.Extra === 'auto_increment') line += ' AUTO_INCREMENT';
        return line;
    });
    var pk = columns.filter(function(c) { return c.Key === 'PRI'; });
    if (pk.length > 0) {
        lines.push('  PRIMARY KEY (`' + pk.map(function(p){ return p.Field; }).join('`, `') + '`)');
    }
    return 'CREATE TABLE `' + tableName + '` (\n' + lines.join(',\n') + '\n)';
}

(async () => {
    try {
        var conn = await mysql.createConnection({
            host: HOST, user: USER, password: PASS, port: PORT,
            multipleStatements: true,
            connectTimeout: 60000
        });
        console.log("Ligado a BD local!");

        await conn.query("DROP DATABASE IF EXISTS `" + NOVA_BD + "`");
        await conn.query("CREATE DATABASE `" + NOVA_BD + "` CHARACTER SET utf8mb4");
        await conn.query("USE `" + NOVA_BD + "`");
        console.log("BD '" + NOVA_BD + "' recriada do zero.");

        var [tables] = await conn.query("SHOW TABLES");
        console.log("OK 0/0: BD limpa");

        // Nao ha ficheiro de export com dados de referência. Aqui deveria ler o export_SRH.sql,
        // mas como recriamos a BD vazia, vamos importar de um ficheiro se existir.
        var file = process.argv[3] || path.join(__dirname, 'export_SRH.sql');
        if (fs.existsSync(file)) {
            var content = fs.readFileSync(file, 'utf8');
            var statements = content
                .split(/;\s*\r?\n/)
                .map(function(s) { return s.replace(/\s*ENGINE=InnoDB\s*DEFAULT\s*CHARSET=utf8mb4\s*/i, '').trim(); })
                .filter(function(s) { return s.length > 0 && !s.startsWith('--'); });

            console.log("Total statements: " + statements.length);
            var ok = 0, err = 0;
            for (var i = 0; i < statements.length; i++) {
                try {
                    await conn.query(statements[i]);
                    ok++;
                } catch (e) {
                    err++;
                    console.error("ERRO " + (i+1) + ": " + statements[i].substring(0, 70));
                    console.error("  " + e.message);
                }
            }
            console.log("Resultado: OK=" + ok + ", ERROS=" + err);
        } else {
            console.log("Ficheiro de export nao encontrado: " + file);
        }

        var [tabs] = await conn.query("SHOW TABLES");
        console.log("Tabelas na BD '" + NOVA_BD + "': " + tabs.map(function(t){ return Object.values(t)[0]; }).join(', '));

        await conn.end();
    } catch (e) {
        console.error("Erro:", e.message);
        process.exit(1);
    }
})();