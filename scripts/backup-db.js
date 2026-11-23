// Backup logico da BD (esquema + dados) usando apenas mysql2.
// Uso:
//   node scripts/backup-db.js --env "caminho/para/.env"          -> cria o backup
//   node scripts/backup-db.js --env "caminho/para/.env" --probe  -> so diagnostico
//
// O ficheiro e guardado em <raiz-do-projecto>/backup/.

var fs = require("fs");
var path = require("path");
var zlib = require("zlib");
var mysql = require("mysql2/promise");

var parseEnv = function (conteudo) {
  var resultado = {};
  conteudo.split(/\r?\n/).forEach(function (linha) {
    var texto = linha.trim();
    if (!texto || texto.charAt(0) === "#") return;
    if (texto.indexOf("export ") === 0) texto = texto.substring(7);
    var pos = texto.indexOf("=");
    if (pos === -1) return;
    var chave = texto.substring(0, pos).trim();
    var valor = texto.substring(pos + 1).trim();
    if ((valor.charAt(0) === '"' && valor.charAt(valor.length - 1) === '"') ||
        (valor.charAt(0) === "'" && valor.charAt(valor.length - 1) === "'")) {
      valor = valor.substring(1, valor.length - 1);
    }
    resultado[chave] = valor;
  });
  return resultado;
};

var sslDe = function (valor) {
  var texto = String(valor || "").trim().toLowerCase();
  if (!texto || texto === "nao" || texto === "não" || texto === "no" ||
      texto === "false" || texto === "0" || texto === "off") return undefined;
  return { rejectUnauthorized: false };
};

var qi = function (nome) {
  return "`" + String(nome).replace(/`/g, "``") + "`";
};

var main = async function () {
  var args = process.argv.slice(2);
  var probe = args.indexOf("--probe") !== -1;
  var posEnv = args.indexOf("--env");
  var envPath = posEnv !== -1 ? args[posEnv + 1] : path.join(__dirname, "..", ".env");
  if (!envPath || !fs.existsSync(envPath)) {
    throw new Error("Ficheiro .env nao encontrado: " + envPath);
  }

  var env = parseEnv(fs.readFileSync(envPath, "utf8"));
  var configuracao = {
    host: env.Host_database || env.DB_HOST || "127.0.0.1",
    port: Number(env.Port_database || env.DB_PORT || 3306),
    user: env.User_database || env.DB_USER,
    password: env.Pass_database || env.DB_PASSWORD || "",
    database: env.Name_database || env.DB_NAME,
    ssl: sslDe(env.SSL_database || env.DB_SSL),
    dateStrings: true,
    jsonStrings: true,
    decimalNumbers: false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  };
  if (!configuracao.user || !configuracao.database) {
    throw new Error("User_database e Name_database sao obrigatorios no .env");
  }

  var ligacao = await mysql.createConnection(configuracao);
  try {
    var [linhas] = await ligacao.query("SHOW FULL TABLES");
    var tabelas = [];
    var vistas = [];
    linhas.forEach(function (linha) {
      var chaves = Object.keys(linha);
      var nome = linha[chaves[0]];
      var tipo = String(linha.Table_type || "").toUpperCase();
      (tipo.indexOf("VIEW") !== -1 ? vistas : tabelas).push(nome);
    });

    console.log("BD: " + configuracao.database + " @ " + configuracao.host + ":" + configuracao.port);
    console.log("Tabelas: " + tabelas.length + " | Vistas: " + vistas.length);

    if (probe) {
      var [info] = await ligacao.query(
        "SELECT table_name AS tabela, table_rows AS linhas, " +
        "ROUND(((data_length + index_length) / 1024 / 1024), 2) AS mb " +
        "FROM information_schema.tables WHERE table_schema = ? " +
        "ORDER BY (data_length + index_length) DESC",
        [configuracao.database]
      );
      var total = info.reduce(function (soma, linha) { return soma + Number(linha.mb || 0); }, 0);
      console.log("Tamanho estimado: " + total.toFixed(2) + " MB");
      console.table(info.slice(0, 15));
      return;
    }

    var sqlValor = function (valor) {
      if (valor === null || valor === undefined) return "NULL";
      if (Buffer.isBuffer(valor)) return "0x" + valor.toString("hex");
      if (typeof valor === "bigint") return valor.toString();
      return ligacao.escape(valor);
    };

    var agora = new Date();
    var sufixo = agora.getFullYear() +
      String(agora.getMonth() + 1).padStart(2, "0") +
      String(agora.getDate()).padStart(2, "0") + "_" +
      String(agora.getHours()).padStart(2, "0") +
      String(agora.getMinutes()).padStart(2, "0") +
      String(agora.getSeconds()).padStart(2, "0");

    var destino = path.join(__dirname, "..", "..", "backup");
    fs.mkdirSync(destino, { recursive: true });
    var nomeBase = configuracao.database.replace(/[^a-zA-Z0-9_-]/g, "_") + "_" + sufixo;
    var ficheiroSql = path.join(destino, nomeBase + ".sql");
    var ficheiroGz = ficheiroSql + ".gz";

    var seccoes = [
      "-- Backup logico de " + configuracao.database,
      "-- Gerado em: " + agora.toISOString(),
      "-- Restaurar: mysql -u UTILIZADOR -p " + configuracao.database + " < " + path.basename(ficheiroSql),
      "",
      "SET NAMES utf8mb4;",
      "SET FOREIGN_KEY_CHECKS = 0;",
      "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
      "",
    ];

    for (var i = 0; i < tabelas.length; i++) {
      var tabela = tabelas[i];
      var [definicoes] = await ligacao.query("SHOW CREATE TABLE " + qi(tabela));
      seccoes.push("-- Tabela: " + tabela);
      seccoes.push("DROP TABLE IF EXISTS " + qi(tabela) + ";");
      seccoes.push(definicoes[0]["Create Table"] + ";");

      var [linhasTabela] = await ligacao.query("SELECT * FROM " + qi(tabela));
      if (linhasTabela.length > 0) {
        var colunas = Object.keys(linhasTabela[0]);
        var colunasSql = colunas.map(qi).join(", ");
        var bloco = [];
        for (var l = 0; l < linhasTabela.length; l++) {
          var linha = linhasTabela[l];
          var valores = colunas.map(function (coluna) { return sqlValor(linha[coluna]); });
          bloco.push("(" + valores.join(", ") + ")");
        }
        for (var inicio = 0; inicio < bloco.length; inicio += 100) {
          seccoes.push("INSERT INTO " + qi(tabela) + " (" + colunasSql + ") VALUES " +
            bloco.slice(inicio, inicio + 100).join(",\n") + ";");
        }
      }
      seccoes.push("");
      console.log("  " + tabela + ": " + linhasTabela.length + " linha(s)");
    }

    for (var v = 0; v < vistas.length; v++) {
      var vista = vistas[v];
      var [defView] = await ligacao.query("SHOW CREATE VIEW " + qi(vista));
      seccoes.push("-- Vista: " + vista);
      seccoes.push("DROP VIEW IF EXISTS " + qi(vista) + ";");
      seccoes.push("SET NAMES " + (defView[0].character_set_client || "utf8mb4") + ";");
      seccoes.push(defView[0]["Create View"] + ";");
      seccoes.push("SET NAMES utf8mb4;");
      seccoes.push("");
    }

    seccoes.push("SET FOREIGN_KEY_CHECKS = 1;");
    seccoes.push("");

    var conteudoSql = seccoes.join("\n");
    fs.writeFileSync(ficheiroSql, conteudoSql, "utf8");
    fs.writeFileSync(ficheiroGz, zlib.gzipSync(Buffer.from(conteudoSql, "utf8"), { level: 9 }));

    console.log("Backup concluido:");
    console.log("  " + ficheiroSql);
    console.log("  " + ficheiroGz);
    console.log("Tamanho: " + (Buffer.byteLength(conteudoSql, "utf8") / 1024 / 1024).toFixed(2) + " MB (SQL)");
  } finally {
    await ligacao.end();
  }
};

if (require.main === module) {
  main().catch(function (erro) {
    console.error("Erro no backup:", erro.message);
    process.exitCode = 1;
  });
}

module.exports = { parseEnv, sslDe, qi };
