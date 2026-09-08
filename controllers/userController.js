var { Op } = require("sequelize");
var { Utilizador, Perfil, Organizacao, Colaborador } = require("../models");

var montarPerfis = function (utilizador) {
  var lista = [];
  if (utilizador.perfil) lista.push(utilizador.perfil);
  (utilizador.perfis_extra || []).forEach(function (p) {
    if (p && !lista.some(function (x) { return x.id === p.id; })) lista.push(p);
  });
  return lista;
};

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 20;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var perfil_id = req.query.perfil_id;

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

    var rows = await Utilizador.findAll({
      where: where,
      include: [
        { model: Perfil, as: "perfil", attributes: ["id", "nome", "nivel"] },
        { model: Perfil, as: "perfis_extra", attributes: ["id", "nome", "nivel"] },
      ],
      attributes: { exclude: ["password", "token_reset", "token_reset_expira"] },
      order: [["nome_completo", "ASC"]],
    });

    var lista = [];
    rows.forEach(function (u) {
      var perfis = montarPerfis(u).map(function (p) {
        return { id: p.id, nome: p.nome, nivel: p.nivel };
      });
      lista.push({
        id: u.id,
        nome_completo: u.nome_completo,
        email: u.email,
        username: u.username,
        telefone: u.telefone,
        activo: u.activo,
        bloqueado: u.bloqueado,
        ultimo_login: u.ultimo_login,
        perfil_id: u.perfil_id,
        perfil: u.perfil || null,
        perfis: perfis,
      });
    });

    // Colaboradores ainda sem conta de acesso
    var semConta = await Colaborador.findAll({
      where: Object.assign(
        { utilizador_id: null },
        req.organizacao_id ? { organizacao_id: req.organizacao_id } : {}
      ),
      attributes: ["id", "numero_colaborador", "nome_completo", "email_institucional", "email_pessoal", "telefone"],
      order: [["nome_completo", "ASC"]],
    });
    semConta.forEach(function (c) {
      lista.push({
        id: "colab_" + c.id,
        colaborador_id: c.id,
        numero_colaborador: c.numero_colaborador,
        nome_completo: c.nome_completo || "",
        email: c.email_institucional || c.email_pessoal || "",
        username: null,
        telefone: c.telefone || null,
        activo: null,
        perfil: null,
        perfil_id: null,
        sem_conta: true,
      });
    });

    // Filtro de perfil: perfil principal OU qualquer perfil adicional
    if (perfil_id) {
      lista = lista.filter(function (x) {
        if (x.sem_conta) return false;
        if (x.perfil_id && String(x.perfil_id) === String(perfil_id)) return true;
        return (x.perfis || []).some(function (p) { return String(p.id) === String(perfil_id); });
      });
    }

    // Filtro de estado: sem contas nao entram quando ha filtro de estado
    if (estado !== undefined) {
      lista = lista.filter(function (x) { return !x.sem_conta; });
    }

    // Pesquisa sobre o conjunto unificado
    if (search) {
      var s = search.toLowerCase();
      lista = lista.filter(function (x) {
        return (x.nome_completo && String(x.nome_completo).toLowerCase().indexOf(s) !== -1) ||
               (x.email && String(x.email).toLowerCase().indexOf(s) !== -1) ||
               (x.username && String(x.username).toLowerCase().indexOf(s) !== -1);
      });
    }

    lista.sort(function (a, b) {
      return String(a.nome_completo || "").localeCompare(String(b.nome_completo || ""));
    });

    var total = lista.length;
    var dados = lista.slice(offset, offset + limit);

    return res.status(200).json({
      dados: dados,
      paginacao: {
        total: total,
        pagina: page,
        limite: limit,
        total_paginas: Math.max(1, Math.ceil(total / limit)),
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
        { model: Perfil, as: "perfis_extra" },
        { model: Organizacao, as: "organizacao", attributes: ["id", "nome"] },
        { model: Colaborador, as: "colaborador", attributes: ["id", "numero_colaborador", "nome_completo"] },
      ],
      attributes: { exclude: ["password", "token_reset", "token_reset_expira"] },
    });

    if (!utilizador) {
      return res.status(404).json({ error: "Utilizador não encontrado" });
    }

    var json = utilizador.toJSON();
    json.perfis = montarPerfis(utilizador).map(function (p) {
      return { id: p.id, nome: p.nome, descricao: p.descricao, nivel: p.nivel, activo: p.activo };
    });
    delete json.perfis_extra;

    return res.status(200).json({ dados: json });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var create = async function (req, res) {
  try {
    var { nome_completo, email, username, password, telefone, perfil_id, perfil_ids, activo, colaborador_id } = req.body;

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

    var perfisSelecionados = Array.isArray(perfil_ids) ? perfil_ids.filter(Boolean) : [];
    if (perfil_id && perfisSelecionados.indexOf(String(perfil_id)) === -1) {
      perfisSelecionados.unshift(String(perfil_id));
    }
    var perfilPrincipal = perfisSelecionados.length > 0 ? perfisSelecionados[0] : null;
    var perfisExtras = perfisSelecionados.slice(1);

    var novoUtilizador = await Utilizador.create({
      nome_completo: nome_completo,
      email: email.toLowerCase(),
      username: username.toLowerCase(),
      password: password,
      telefone: telefone || null,
      perfil_id: perfilPrincipal,
      organizacao_id: req.organizacao_id,
      activo: activo !== undefined ? activo : true,
      must_change_password: true,
    });

    if (perfisExtras.length > 0) {
      await novoUtilizador.setPerfis_extra(perfisExtras);
    }

    if (colaborador_id) {
      await Colaborador.update({ utilizador_id: novoUtilizador.id }, { where: { id: colaborador_id } });
    }

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

    // Perfis (principal + adicionais)
    if (Array.isArray(req.body.perfil_ids)) {
      var perfisSelecionados = req.body.perfil_ids.filter(Boolean).map(String);
      var corpoPerfilId = req.body.perfil_id;
      if (corpoPerfilId && perfisSelecionados.indexOf(String(corpoPerfilId)) === -1) {
        perfisSelecionados.unshift(String(corpoPerfilId));
      }
      if (perfisSelecionados.length === 0) {
        dadosActualizar.perfil_id = null;
        await utilizador.setPerfis_extra([]);
      } else {
        dadosActualizar.perfil_id = perfisSelecionados[0];
        await utilizador.setPerfis_extra(perfisSelecionados.slice(1));
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
