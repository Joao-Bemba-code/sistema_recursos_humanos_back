var jwt = require("jsonwebtoken");
var { Utilizador, Perfil, Organizacao, Colaborador } = require("../models");

var SENHA_PADRAO = "colaborador123";

var generateToken = function (utilizador) {
  return jwt.sign(
    {
      id: utilizador.id,
      email: utilizador.email,
      organizacao_id: utilizador.organizacao_id,
    },
    process.env.SECRET,
    { expiresIn: "24h" }
  );
};

var generateRefreshToken = function (utilizador) {
  return jwt.sign(
    { id: utilizador.id, type: "refresh" },
    process.env.SECRET,
    { expiresIn: "7d" }
  );
};

var login = async function (req, res) {
  try {
    var { email, username, password } = req.body;

    if (!email && !username) {
      return res.status(400).json({ error: "Email ou username é obrigatório" });
    }
    if (!password) {
      return res.status(400).json({ error: "Password é obrigatória" });
    }

    var where = email ? { email: email.toLowerCase() } : { username: username.toLowerCase() };

    var utilizador = await Utilizador.findOne({
      where: where,
      include: [
        { model: Perfil, as: "perfil" },
        { model: Organizacao, as: "organizacao" },
      ],
    });

    // Auto-criar conta para colaborador que ja existe na BD mas nao tem login
    if (!utilizador && email) {
      var colaborador = await Colaborador.findOne({
        where: { email_institucional: email.toLowerCase() },
      }).catch(function () { return null; });

      if (!colaborador) {
        colaborador = await Colaborador.findOne({
          where: { email_pessoal: email.toLowerCase() },
        }).catch(function () { return null; });
      }

      if (colaborador && password === SENHA_PADRAO) {
        var perfilColab = await Perfil.findOne({ where: { nome: "Colaborador" } });

        var usernameGerado = email.toLowerCase().split("@")[0];

        var existeUsername = await Utilizador.findOne({ where: { username: usernameGerado } });
        if (existeUsername) {
          usernameGerado = usernameGerado + "_" + Date.now().toString(36);
        }

        utilizador = await Utilizador.create({
          nome_completo: colaborador.nome_completo,
          email: email.toLowerCase(),
          username: usernameGerado,
          password: SENHA_PADRAO,
          telefone: colaborador.telefone || null,
          organizacao_id: colaborador.organizacao_id,
          perfil_id: perfilColab ? perfilColab.id : null,
          activo: true,
          must_change_password: true,
        });

        await colaborador.update({ utilizador_id: utilizador.id }).catch(function () {});

        utilizador = await Utilizador.findByPk(utilizador.id, {
          include: [
            { model: Perfil, as: "perfil" },
            { model: Organizacao, as: "organizacao" },
          ],
        });

        console.log(" Conta criada automaticamente para: " + email);
      }
    }

    if (!utilizador) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    if (!utilizador.activo) {
      return res.status(403).json({ error: "Conta desactivada. Contacte o administrador." });
    }

    if (utilizador.bloqueado) {
      return res.status(403).json({ error: "Conta bloqueada. Contacte o administrador." });
    }

    var passwordValida = await utilizador.verificarPassword(password);
    if (!passwordValida) {
      var tentativas = (utilizador.tentativas_login || 0) + 1;
      var updateData = { tentativas_login: tentativas };
      if (tentativas >= 5) {
        updateData.bloqueado = true;
      }
      await utilizador.update(updateData);

      var msgExtra = tentativas >= 5
        ? " Conta bloqueada por segurança."
        : " Tentativa " + tentativas + " de 5.";
      return res.status(401).json({ error: "Credenciais inválidas." + msgExtra });
    }

    if (utilizador.bloqueado) {
      await utilizador.update({ bloqueado: false, tentativas_login: 0 });
    } else if (utilizador.tentativas_login > 0) {
      await utilizador.update({ tentativas_login: 0 });
    }

    await utilizador.update({ ultimo_login: new Date() });

    var token = generateToken(utilizador);
    var refreshToken = generateRefreshToken(utilizador);

    return res.status(200).json({
      mensagem: "Login realizado com sucesso",
      token: token,
      refreshToken: refreshToken,
      utilizador: utilizador.toJSON(),
    });
  } catch (e) {
    console.log("Erro no login:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var register = async function (req, res) {
  try {
    var { nome_completo, email, username, password, telefone, organizacao_id, perfil_id } = req.body;

    if (!nome_completo || !email || !username || !password) {
      return res.status(400).json({ error: "Campos obrigatórios: nome_completo, email, username, password" });
    }

    var existente = await Utilizador.findOne({
      where: { email: email.toLowerCase() },
    });
    if (existente) {
      return res.status(409).json({ error: "Email já está em uso" });
    }

    existente = await Utilizador.findOne({
      where: { username: username.toLowerCase() },
    });
    if (existente) {
      return res.status(409).json({ error: "Username já está em uso" });
    }

    var orgId = organizacao_id || req.organizacao_id;

    if (!orgId) {
      var org = await Organizacao.findOne();
      if (!org) {
        return res.status(400).json({ error: "Nenhuma organização encontrada. Crie uma primeiro." });
      }
      orgId = org.id;
    }

    var perfil = null;
    if (perfil_id) {
      perfil = await Perfil.findByPk(perfil_id);
    } else {
      perfil = await Perfil.findOne({ where: { nome: "Colaborador" } });
    }

    var novoUtilizador = await Utilizador.create({
      nome_completo: nome_completo,
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      password: password,
      telefone: telefone || null,
      organizacao_id: orgId,
      perfil_id: perfil ? perfil.id : null,
      must_change_password: true,
    });

    var completo = await Utilizador.findByPk(novoUtilizador.id, {
      include: [
        { model: Perfil, as: "perfil" },
        { model: Organizacao, as: "organizacao" },
      ],
    });

    var token = generateToken(completo);

    return res.status(201).json({
      mensagem: "Utilizador criado com sucesso",
      token: token,
      utilizador: completo.toJSON(),
    });
  } catch (e) {
    console.log("Erro no register:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getProfile = async function (req, res) {
  try {
    return res.status(200).json({
      utilizador: req.utilizador.toJSON(),
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var changePassword = async function (req, res) {
  try {
    var { password_atual, password_nova } = req.body;

    if (!password_atual || !password_nova) {
      return res.status(400).json({ error: "Password actual e nova password são obrigatórias" });
    }

    if (password_nova.length < 6) {
      return res.status(400).json({ error: "Nova password deve ter pelo menos 6 caracteres" });
    }

    var utilizador = await Utilizador.findByPk(req.utilizador.id);
    var valid = await utilizador.verificarPassword(password_atual);

    if (!valid) {
      return res.status(401).json({ error: "Password actual incorreta" });
    }

    await utilizador.update({
      password: password_nova,
      must_change_password: false,
    });

    return res.status(200).json({ mensagem: "Password alterada com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { login, register, getProfile, changePassword, generateToken };
