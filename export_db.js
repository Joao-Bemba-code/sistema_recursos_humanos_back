var dotenv = require('dotenv');
dotenv.config({path: __dirname + '/.env'});

var fs = require('fs');
var {Name_database, User_database, Pass_database, Host_database, Lang_database} = process.env;
var Sequelize = require('sequelize');

var sequelize = new Sequelize(Name_database, User_database, Pass_database, {
    host: Host_database,
    dialect: Lang_database,
    port: 4076,
    dialectOptions: {
        ssl: { require: true, rejectUnauthorized: false }
    },
    connectTimeout: 60000,
    logging: false
});

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
    
    return 'CREATE TABLE `' + tableName + '` (\n' + lines.join(',\n') + '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;';
}

(async () => {
    try {
        await sequelize.authenticate();
        console.log("Ligado a BD!");

        var [tables] = await sequelize.query("SHOW TABLES");
        var key = Object.keys(tables[0])[0];
        var tableNames = tables.map(function(t) { return t[key]; });

        var sql = '-- Exportacao da base de dados ' + Name_database + '\n';
        sql += '-- Data: ' + new Date().toISOString() + '\n\n';

        for (var i = 0; i < tableNames.length; i++) {
            var tableName = tableNames[i];
            console.log("A exportar: " + tableName);

            var [columns] = await sequelize.query("SHOW COLUMNS FROM `" + tableName + "`");
            var [rows] = await sequelize.query("SELECT * FROM `" + tableName + "`");

            sql += '-- Tabela: ' + tableName + '\n';
            sql += 'DROP TABLE IF EXISTS `' + tableName + '`;\n';
            sql += getCreateTableSQL(tableName, columns) + '\n\n';

            if (rows.length > 0) {
                var colNames = columns.map(function(c) { return c.Field; });
                var batchSize = 500;
                for (var b = 0; b < rows.length; b += batchSize) {
                    var batch = rows.slice(b, b + batchSize);
                    for (var j = 0; j < batch.length; j++) {
                        var row = batch[j];
                        var vals = colNames.map(function(c) { return escapeValue(row[c]); });
                        sql += 'INSERT INTO `' + tableName + '` (`' + colNames.join('`, `') + '`) VALUES (' + vals.join(', ') + ');\n';
                    }
                }
            }
            sql += '\n';
        }

        var outFile = __dirname + '/export_' + Name_database + '.sql';
        fs.writeFileSync(outFile, sql, 'utf8');
        console.log("\nExportacao concluida: " + outFile);
        console.log("Total tabelas: " + tableNames.length);

        await sequelize.close();
    } catch (e) {
        console.error("Erro:", e.message);
        await sequelize.close();
    }
})();