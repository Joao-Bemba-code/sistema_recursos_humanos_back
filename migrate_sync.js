var dotenv = require('dotenv');
dotenv.config({path: __dirname + '/.env'});

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

var TIPO_ENUM = "`tipo` ENUM('ferias','adiantamento','justificacao','aumento','dispensa','licenca','outro') NOT NULL";
var ALTER_TIPO = "ALTER TABLE `pedidos_colaborador` MODIFY COLUMN " + TIPO_ENUM;

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

async function aplicarAlter(conn, label) {
    try {
        var [colunas] = await conn.query("SHOW COLUMNS FROM `pedidos_colaborador` LIKE 'tipo'");
        if (colunas.length === 0) {
            console.log(label + " -> tabela pedidos_colaborador sem coluna 'tipo', salto.");
            return false;
        }
        var tipoAtual = colunas[0].Type || "";
        if (tipoAtual.indexOf("dispensa") !== -1 && tipoAtual.indexOf("licenca") !== -1) {
            console.log(label + " -> ENUM 'tipo' ja contem dispensa/licenca. Nada a fazer.");
            return false;
        }
        await conn.query(ALTER_TIPO);
        console.log(label + " -> ENUM 'tipo' atualizado com dispensa/licenca.");
        return true;
    } catch (e) {
        console.log(label + " -> ERRO ao alterar enum tipo: " + e.message);
        return false;
    }
}

async function sincronizarTabela(oldConn, newConn, table) {
    var [newCols] = await newConn.query("SHOW COLUMNS FROM `" + table + "`");
    if (newCols.length === 0) {
        console.log("  " + table + ": salto (tabela nao existe na nova)");
        return 0;
    }
    var nomes = newCols.map(function (c) { return c.Field; });
    var pkFields = newCols.filter(function (c) { return c.Key === 'PRI'; }).map(function (c) { return c.Field; });
    if (pkFields.length === 0) {
        console.log("  " + table + ": salto (sem PK)");
        return 0;
    }

    var [oldRows] = await oldConn.query("SELECT * FROM `" + table + "`");
    var [newRows] = await newConn.query("SELECT * FROM `" + table + "`");

    var existentes = {};
    newRows.forEach(function (r) {
        existentes[pkFields.map(function (f) { return String(r[f]); }).join('|')] = true;
    });

    var inseridos = 0;
    var porInserir = [];
    oldRows.forEach(function (r) {
        var chave = pkFields.map(function (f) { return String(r[f]); }).join('|');
        if (!existentes[chave]) porInserir.push(r);
    });

    if (porInserir.length === 0) {
        console.log("  " + table + ": antiga=" + oldRows.length + " nova=" + newRows.length + " -> nada novo");
        return 0;
    }

    for (var i = 0; i < porInserir.length; i++) {
        var row = porInserir[i];
        var vals = nomes.map(function (c) { return escapeValue(row[c]); });
        var sql = "INSERT INTO `" + table + "` (`" + nomes.join('`, `') + "`) VALUES (" + vals.join(', ') + ")";
        try {
            await newConn.query(sql);
            inseridos++;
        } catch (e) {
            console.log("  ERRO ao inserir em " + table + " (linha " + (i + 1) + "): " + e.message);
        }
    }
    console.log("  " + table + ": +" + inseridos + " novos registos copiados para a nova BD");
    return inseridos;
}

(async () => {
    var oldConn, newConn;
    try {
        oldConn = await mysql.createConnection(OLD_CONFIG);
        console.log("Ligado a BD local!");
        newConn = await mysql.createConnection(NEW_CONFIG);
        console.log("Ligado a BD local!");

        console.log("\n=== 1. ATUALIZAR ENUM 'tipo' (pedidos_colaborador) ===");
        await aplicarAlter(oldConn, "LOCAL A");
        await aplicarAlter(newConn, "LOCAL B");

        console.log("\n=== 2. SINCRONIZAR DADOS NOVOS ===");
        var [oldTables] = await oldConn.query("SHOW TABLES");
        var key = Object.keys(oldTables[0])[0];
        var tabelas = oldTables.map(function (t) { return t[key]; });
        var total = 0;
        for (var i = 0; i < tabelas.length; i++) {
            total += await sincronizarTabela(oldConn, newConn, tabelas[i]);
        }
        console.log("\nTotal de registos novos sincronizados: " + total);

        await oldConn.end();
        await newConn.end();
        console.log("Concluido!");
    } catch (e) {
        console.error("Erro:", e.message);
        if (oldConn) await oldConn.end();
        if (newConn) await newConn.end();
        process.exit(1);
    }
})();