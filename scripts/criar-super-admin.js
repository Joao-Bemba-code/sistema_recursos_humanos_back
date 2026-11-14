// Cria (ou promove) a conta de super-admin da plataforma.
//
// Esta conta NAO pertence a nenhuma organizacao e serve apenas para criar e
// gerir organizacoes no painel /dashboard/plataforma. Nunca deve ver dados
// de colaboradores, contratos, ferias ou credito de nenhuma organizacao.
//
// Uso:
//   node scripts/criar-super-admin.js --email=admin@exemplo.ao --nome="Administrador da Plataforma"
//   node scripts/criar-super-admin.js --email=... --nome=... --username=superadmin --senha=MinhaSenhaForte123
//
// Tambem aceita variaveis de ambiente:
//   SUPER_ADMIN_EMAIL, SUPER_ADMIN_NOME, SUPER_ADMIN_USERNAME, SUPER_ADMIN_SENHA
//
// Sem --senha/SUPER_ADMIN_SENHA o script gera uma senha forte e mostra-a UMA vez.
// Nada e escrito em ficheiros nem em logs.

var crypto = require("crypto");
var { sequelize, Utilizador } = require("../models");

var obterArg = function (nome) {
  var prefixo = "--" + nome + "=";
  var args = process.argv.slice(2);
  for (var i = 0; i < args.length; i++) {
    if (args[i].indexOf(prefixo) === 0) return args[i].slice(prefixo.length);
  }
  return null;
};

var valor = function (arg, env) {
  var v = obterArg(arg);
  if (v !== null) return v;
  return process.env[env] || null;
};

var SEM_AMBIGUOS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
var SIMBOLOS = "!@#$%*-_+";

var gerarSenha = function (tamanho) {
  tamanho = tamanho || 16;
  var partes = [SEM_AMBIGUOS, SIMBOLOS];
  var senha = "";
  // Garante pelo menos um simbolo e um digito.
  senha += SIMBOLOS[crypto.randomInt(SIMBOLOS.length)];
  senha += "23456789"[crypto.randomInt(8)];
  while (senha.length < tamanho) {
    var conjunto = partes[0];
    senha += conjunto[crypto.randomInt(conjunto.length)];
  }
  // Baralha para os caracteres garantidos nao ficarem fixos no inicio.
  var chars = senha.split("");
  for (var i = chars.length - 1; i > 0; i--) {
    var j = crypto.randomInt(i + 1);
    var tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }
  return chars.join("");
};

var garantirColunas = async function () {
  var resultado = await sequelize.query("SHOW COLUMNS FROM `utilizadores`");
  var linhas = Array.isArray(resultado[0]) ? resultado[0] : resultado;
  var nomes = linhas.map(function (c) { return c.Field; });

  if (nomes.indexOf("organizacao_id") === -1) {
    await sequelize.query("ALTER TABLE `utilizadores` ADD COLUMN `organizacao_id` CHAR(36) NULL");
    console.log("Coluna 'organizacao_id' adicionada a utilizadores.");
  }
  if (nomes.indexOf("super_admin") === -1) {
    await sequelize.query("ALTER TABLE `utilizadores` ADD COLUMN `super_admin` BOOLEAN NOT NULL DEFAULT false");
    console.log("Coluna 'super_admin' adicionada a utilizadores.");
  }
};

var usernameDisponivel = async function (base, idActual) {
  var tentativa = base;
  var contador = 0;
  while (true) {
    var existente = await Utilizador.findOne({ where: { username: tentativa }, attributes: ["id"] });
    if (!existente || (idActual && existente.id === idActual)) return tentativa;
    contador++;
    tentativa = base + contador;
  }
};

var criarUsername = function (email) {
  var base = String(email).split("@")[0]
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]/g, "");
  if (!base) base = "superadmin";
  return base.slice(0, 40);
};

var main = async function () {
  try {
    var email = (valor("email", "SUPER_ADMIN_EMAIL") || "").trim().toLowerCase();
    var nome = (valor("nome", "SUPER_ADMIN_NOME") || "").trim();
    var usernamePedido = (valor("username", "SUPER_ADMIN_USERNAME") || "").trim().toLowerCase();
    var senhaPedida = valor("senha", "SUPER_ADMIN_SENHA");

    if (!email || !nome) {
      console.log("Faltam dados: use --nome= e --email= (ou SUPER_ADMIN_NOME / SUPER_ADMIN_EMAIL).");
      process.exit(1);
    }

    await sequelize.authenticate();
    await garantirColunas();

    var existente = await Utilizador.findOne({ where: { email: email } });
    var senhaMostrada = null;

    if (existente) {
      // Promover uma conta existente: nao mexe na senha sem pedido explicito.
      var dados = {
        super_admin: true,
        organizacao_id: null,
        activo: true,
        bloqueado: false,
        tentativas_login: 0,
      };
      if (senhaPedida) {
        if (String(senhaPedida).length < 8) {
          console.log("A senha indicada tem menos de 8 caracteres.");
          process.exit(1);
        }
        dados.password = senhaPedida;
        senhaMostrada = senhaPedida;
      }
      await existente.update(dados);
      console.log("Conta existente promovida a super-admin da plataforma.");
      console.log("Nome:     " + existente.nome_completo);
      console.log("Email:    " + existente.email);
      console.log("Username: " + existente.username);
      if (senhaMostrada) {
        console.log("Senha:    " + senhaMostrada + "   (definida agora; guarde-a)");
      } else {
        console.log("Senha:    mantida a senha actual (use --senha=... para definir outra)");
      }
    } else {
      var username = usernamePedido || criarUsername(email);
      username = await usernameDisponivel(username, null);

      var senha = senhaPedida || gerarSenha(16);
      if (String(senha).length < 8) {
        console.log("A senha indicada tem menos de 8 caracteres.");
        process.exit(1);
      }

      var novo = await Utilizador.create({
        nome_completo: nome,
        email: email,
        username: username,
        password: senha,
        telefone: null,
        organizacao_id: null,
        super_admin: true,
        activo: true,
        bloqueado: false,
        must_change_password: false,
      });

      console.log("");
      console.log("=== Super-admin da plataforma criado ===");
      console.log("Nome:     " + novo.nome_completo);
      console.log("Email:    " + novo.email);
      console.log("Username: " + novo.username);
      console.log("Senha:    " + senha);
      console.log("");
      console.log("Guarde a senha agora: ela nao volta a ser mostrada.");
      console.log("Entre em /plataforma/login (login proprio da plataforma).");
    }

    await sequelize.close();
    process.exit(0);
  } catch (e) {
    console.log("Erro ao criar super-admin:", e.message);
    try { await sequelize.close(); } catch (e2) { /* ignore */ }
    process.exit(1);
  }
};

main();
