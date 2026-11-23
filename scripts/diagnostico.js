// Verifica a configuracao da BD e as tabelas usadas no login.
// Uso: npm run diagnostico   (com as variaveis de ambiente no .env)
var { sequelize } = require("../config");

var TABELAS = ["utilizadores", "perfis", "organizacoes", "utilizadores_perfis", "colaboradores"];

(async function () {
  var ok = true;
  try {
    await sequelize.authenticate();
    console.log("Ligacao: OK");
  } catch (e) {
    ok = false;
    console.log("Ligacao: ERRO -> " + e.message);
    process.exitCode = 1;
    return;
  }

  for (var i = 0; i < TABELAS.length; i++) {
    var tabela = TABELAS[i];
    try {
      var resultado = await sequelize.query("SHOW TABLES LIKE '" + tabela + "'");
      var linhas = Array.isArray(resultado[0]) ? resultado[0] : resultado;
      console.log("Tabela " + tabela + ": " + (linhas.length ? "OK" : "FALTA"));
      if (!linhas.length) ok = false;
    } catch (e) {
      ok = false;
      console.log("Tabela " + tabela + ": ERRO -> " + e.message);
    }
  }

  try {
    var res = await sequelize.query("SHOW COLUMNS FROM `utilizadores`");
    var colunas = (Array.isArray(res[0]) ? res[0] : res).map(function (c) { return c.Field; });
    var necessarias = ["id", "email", "username", "password", "perfil_id", "organizacao_id", "super_admin", "activo", "bloqueado", "tentativas_login"];
    var faltando = necessarias.filter(function (c) { return colunas.indexOf(c) === -1; });
    console.log("Colunas de utilizadores: " + (faltando.length ? "FALTAM " + faltando.join(", ") : "OK"));
    if (faltando.length) ok = false;
  } catch (e) {
    ok = false;
    console.log("Colunas de utilizadores: ERRO -> " + e.message);
  }

  if (!ok) process.exitCode = 1;
  await sequelize.close();
})();
