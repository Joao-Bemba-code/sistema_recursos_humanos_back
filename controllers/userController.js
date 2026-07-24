var { Op } = require("sequelize");
var { Utilizador, Perfil, Organizacao } = require("../models");

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 20;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;

    var where = {};
    if (req.organizacao_id) {
      where.organizacao_id = req.organizacao_id;
    }

    if (search) {
      where[Op.or] = [
        { nome_completo: { [Op.like]: "%" + search + "%" } },
        { email: { [Op.like]: "%" + search + "%" } },
        { username: { [Op.like]: "%" + search + "%" } },
      ];
    }

    if (estado !== undefined) {
      where.activo = estado === "true" || estado === "1";
    }

    var { count, rows } = await Utilizador.findAndCountAll({
      where: where,
      include: [
        { model: Perfil, as: "perfil", attributes: ["id", "nome", "nivel"] },
      ],
      attributes: { exclude: ["password", "token_reset", "token_reset_expira"] },
      order: [["nome_completo", "ASC"]],
      limit: limit,
      offset: offset,
    });

    return res.status(200).json({
      dados: rows,
      paginacao: {
        total: count,
        pagina: page,
        limite: limit,
        total_paginas: Math.ceil(count / limit),
      },
    });
  } catch (e) {
    console.log("Erro ao listar utilizadores:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getById = async function (req, res) {
  try {
    var { id } = req.params;

    var utilizador = await Utilizador.findByPk(id, {
      include: [
        { model: Perfil, as: "perfil" },
        { model: Organizacao, as: "organizacao" },
      ],
      attributes: { exclude: ["password", "token_reset", "token_reset_expira"] },
    });

    if (!utilizador) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }

    return res.status(200).json({ dados: utilizador });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var create = async function (req, res) {
  try {
    var { nome_completo, email, username, password, telefone, perfil_id, activo } = req.body;

    if (!nome_completo || !email || !username || !password) {
      return res.status(400).json({ error: "Campos obrigatórios: nome_completo, email, username, password" });
    }

    var existente = await Utilizador.findOne({ where: { email: email.toLowerCase() } });
    if (existente) {
      return res.status(409).json({ error: "Email já está em uso" });
    }

    existente = await Utilizador.findOne({ where: { username: username.toLowerCase() } });
    if (existente) {
      return res.status(409).json({ error: "Username já está em uso" });
    }

    var novoUtilizador = await Utilizador.create({
      nome_completo: nome_completo,
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      password: password,
      telefone: telefone || null,
      perfil_id: perfil_id || null,
      organizacao_id: req.organizacao_id,
      activo: activo !== undefined ? activo : true,
      must_change_password: true,
    });

    var completo = await Utilizador.findByPk(novoUtilizador.id, {
      include: [{ model: Perfil, as: "perfil" }],
      attributes: { exclude: ["password"] },
    });

    return res.status(201).json({
      mensagem: "Utilizador criado com sucesso",
      dados: completo,
    });
  } catch (e) {
    console.log("Erro ao criar utilizador:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var update = async function (req, res) {
  try {
    var { id } = req.params;
    var utilizador = await Utilizador.findByPk(id);

    if (!utilizador) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }

    var camposPermitidos = ["nome_completo", "email", "username", "telefone", "perfil_id", "activo", "bloqueado"];
    var dadosActualizar = {};

    for (var i = 0; i < camposPermitidos.length; i++) {
      var campo = camposPermitidos[i];
      if (req.body[campo] !== undefined) {
        dadosActualizar[campo] = req.body[campo];
      }
    }

    if (dadosActualizar.email) {
      dadosActualizar.email = dadosActualizar.email.toLowerCase();
      var existente = await Utilizador.findOne({
        where: { email: dadosActualizar.email, id: { [Op.ne]: id } },
      });
      if (existente) {
        return res.status(409).json({ error: "Email já está em uso" });
      }
    }

    if (dadosActualizar.username) {
      dadosActualizar.username = dadosActualizar.username.toLowerCase();
      var existente = await Utilizador.findOne({
        where: { username: dadosActualizar.username, id: { [Op.ne]: id } },
      });
      if (existente) {
        return res.status(409).json({ error: "Username já está em uso" });
      }
    }

    await utilizador.update(dadosActualizar);

    var actualizado = await Utilizador.findByPk(id, {
      include: [{ model: Perfil, as: "perfil" }],
      attributes: { exclude: ["password", "token_reset", "token_reset_expira"] },
    });

    return res.status(200).json({
      mensagem: "Utilizador actualizado com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var remove = async function (req, res) {
  try {
    var { id } = req.params;
    var utilizador = await Utilizador.findByPk(id);

    if (!utilizador) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }

    if (utilizador.id === req.utilizador.id) {
      return res.status(400).json({ error: "Não pode eliminar a sua própria conta" });
    }

    await utilizador.update({ activo: false });

    return res.status(200).json({ mensagem: "Utilizador desactivado com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var changePassword = async function (req, res) {
  try {
    var { id } = req.params;
    var { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Senha actual e nova senha sao obrigatorias" });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: "A nova senha deve ter pelo menos 6 caracteres" });
    }

    var utilizador = await Utilizador.findByPk(id);
    if (!utilizador) {
      return res.status(404).json({ error: "Utilizador nao encontrado" });
    }

    var valido = await utilizador.verificarPassword(current_password);
    if (!valido) {
      return res.status(401).json({ error: "Senha actual incorreta" });
    }

    await utilizador.update({ password: new_password });

    return res.status(200).json({ mensagem: "Senha alterada com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var changeEmail = async function (req, res) {
  try {
    var { id } = req.params;
    var { new_email, current_password } = req.body;

    if (!new_email || !current_password) {
      return res.status(400).json({ error: "Novo email e senha sao obrigatorios" });
    }

    var utilizador = await Utilizador.findByPk(id);
    if (!utilizador) {
      return res.status(404).json({ error: "Utilizador nao encontrado" });
    }

    var valido = await utilizador.verificarPassword(current_password);
    if (!valido) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    var existente = await Utilizador.findOne({ where: { email: new_email.toLowerCase(), id: { [Op.ne]: id } } });
    if (existente) {
      return res.status(409).json({ error: "Email ja esta em uso" });
    }

    await utilizador.update({ email: new_email.toLowerCase() });

    var actualizado = await Utilizador.findByPk(id, {
      include: [{ model: Perfil, as: "perfil" }],
    });

    return res.status(200).json({ mensagem: "Email actualizado com sucesso", dados: actualizado });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { list, getById, create, update, remove, changePassword, changeEmail };
