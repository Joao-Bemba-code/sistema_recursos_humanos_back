// Verifica se um backup .sql corresponde ao estado ATUAL da base de dados.
// Compara, tabela a tabela: numero de linhas, hash do conteudo e esquema.
// Uso: node scripts/verificar-backup.js --env "caminho/.env" [--ficheiro caminho/backup.sql]

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var mysql = require("mysql2/promise");
var { parseEnv, sslDe, qi } = require("./backup-db");

var hash = function (texto) {
  return crypto.createHash("sha256").update(String(texto), "utf8").digest("hex").slice(0, 16);
};
var normalizar = function (texto) {
  return String(texto || "").replace(/\s+/g, " ").trim();
};

// Extrai do .sql os blocos INSERT (uma tupla por linha, gerados pelo backup-db.js).
var tuplesDoDump = function (conteudo) {
  var resultado = {};
  var atual = null;
  var acrescentar = function (textoBruto) {
    var texto = String(textoBruto || "").trim();
    if (!texto || !atual) return;
    atual.tuplas.push(texto.replace(/,?;?\s*$/, ""));
    if (/;\s*$/.test(texto)) atual = null;
  };
  conteudo.split(/\r?\n/).forEach(function (linha) {
    // A primeira tupla vem na mesma linha do "VALUES" (ver backup-db.js).
    var cabecalho = linha.match(/^INSERT INTO `([^`]+)` \(([^)]*)\) VALUES\s*(.*)$/);
    if (cabecalho) {
      // Uma tabela pode ter varios blocos INSERT (100 tuplas por bloco): acumular todos.
      if (!resultado[cabecalho[1]]) {
        resultado[cabecalho[1]] = { colunas: cabecalho[2].split(", ").length, tuplas: [] };
      }
      atual = resultado[cabecalho[1]];
      acrescentar(cabecalho[3]);
      return;
    }
    acrescentar(linha);
  });
  return resultado;
};

var main = async function () {
  var args = process.argv.slice(2);
  var posEnv = args.indexOf("--env");
  var posFich = args.indexOf("--ficheiro");
  var envPath = posEnv !== -1 ? args[posEnv + 1] : path.join(__dirname, "..", ".env");
  var env = parseEnv(fs.readFileSync(envPath, "utf8"));

  var pastaBackup = path.join(__dirname, "..", "..", "backup");
  var ficheiro = posFich !== -1 ? args[posFich + 1] : fs.readdirSync(pastaBackup)
    .filter(function (n) { return /\.sql$/.test(n); })
    .sort()
    .pop();
  if (!ficheiro || !path.isAbsolute(ficheiro)) ficheiro = path.join(pastaBackup, ficheiro || "");
  if (!fs.existsSync(ficheiro)) throw new Error("Ficheiro de backup nao encontrado: " + ficheiro);

  var conteudo = fs.readFileSync(ficheiro, "utf8");
  var dump = tuplesDoDump(conteudo);

  var ligacao = await mysql.createConnection({
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
  });

  try {
    var [linhas] = await ligacao.query("SHOW FULL TABLES");
    var tabelas = linhas.map(function (linha) {
      return linha[Object.keys(linha)[0]];
    }).filter(function (nome) {
      return String(linhas.find(function (l) { return l[Object.keys(l)[0]] === nome; }).Table_type || "").toUpperCase().indexOf("VIEW") === -1;
    });

    var sqlValor = function (valor) {
      if (valor === null || valor === undefined) return "NULL";
      if (Buffer.isBuffer(valor)) return "0x" + valor.toString("hex");
      if (typeof valor === "bigint") return valor.toString();
      return ligacao.escape(valor);
    };

    var falhas = [];
    var totalLinhas = 0;
    var dumpNormalizado = normalizar(conteudo);

    for (var i = 0; i < tabelas.length; i++) {
      var tabela = tabelas[i];
      var [linhasVivas] = await ligacao.query("SELECT * FROM " + qi(tabela));
      var tuplasVivas = linhasVivas.map(function (linha) {
        return "(" + Object.keys(linha).map(function (coluna) {
          return sqlValor(linha[coluna]);
        }).join(", ") + ")";
      });
      var tuplasBackup = (dump[tabela] && dump[tabela].tuplas) || [];

      var [definicao] = await ligacao.query("SHOW CREATE TABLE " + qi(tabela));
      var esquemaOk = dumpNormalizado.indexOf(normalizar(definicao[0]["Create Table"])) !== -1;
      var dadosOk = tuplasVivas.length === tuplasBackup.length &&
        hash(tuplasVivas.join("\n")) === hash(tuplasBackup.join("\n"));

      totalLinhas += tuplasVivas.length;
      if (!dadosOk || !esquemaOk) {
        falhas.push(tabela + " (backup=" + tuplasBackup.length + ", BD=" + tuplasVivas.length +
          ", dados=" + (dadosOk ? "OK" : "DIVERGENTE") + ", esquema=" + (esquemaOk ? "OK" : "DIVERGENTE") + ")");
      }
    }

    console.log("Ficheiro verificado: " + ficheiro);
    console.log("Tabelas: " + tabelas.length + " | Linhas comparadas: " + totalLinhas);
    console.log("Backup contem tabelas extras: " +
      (Object.keys(dump).filter(function (n) { return tabelas.indexOf(n) === -1; }).join(", ") || "nenhuma"));
    if (falhas.length === 0) {
      console.log("RESULTADO: IGUAIS — esquema e dados de todas as tabelas conferem com a BD atual.");
    } else {
      console.log("RESULTADO: DIVERGENCIAS em " + falhas.length + " tabela(s):");
      falhas.forEach(function (f) { console.log("  - " + f); });
      process.exitCode = 1;
    }
  } finally {
    await ligacao.end();
  }
};

main().catch(function (erro) {
  console.error("Erro na verificacao:", erro.message);
  process.exitCode = 1;
});
