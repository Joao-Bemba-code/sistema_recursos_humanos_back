var { Op } = require("sequelize");
var { sequelize, Organizacao, Utilizador, Colaborador, Perfil } = require("../models");
var { guardarFicheiro, urlDoFicheiro, apagarFicheiroDeUrl } = require("../helpers/ficheiros");

// ==================== PLATAFORMA (SUPER-ADMIN) ====================
// Contas com super_admin = true gerem a lista de organizacoes. Nao pertencem
// a nenhuma organizacao e nunca recebem dados de nenhuma delas - so contagens.

var camposOrganizacao = ["nome", "nome_curto", "nif", "email", "telefone", "endereco", "cidade", "provincia", "pais", "website", "dominio"];

var limparCampos = function (corpo) {
  var dados = {};
  camposOrganizacao.forEach(function (campo) {
    if (corpo[campo] !== undefined) {
      dados[campo] = corpo[campo] === "" ? null : corpo[campo];
    }
  });
  return dados;
};

var validarUnicos = async function (dados, ignorarId) {
  if (dados.nif) {
    var porNif = await Organizacao.findOne({
      where: { nif: dados.nif, ...(ignorarId ? { id: { [Op.ne]: ignorarId } } : {}) },
    });
    if (porNif) return "NIF já está registado";
  }
  if (dados.dominio) {
    var porDominio = await Organizacao.findOne({
      where: { dominio: dados.dominio, ...(ignorarId ? { id: { [Op.ne]: ignorarId } } : {}) },
    });
    if (porDominio) return "Domínio já está em uso";
  }
  return null;
};

var gerarUsername = async function (email) {
  var base = String(email || "").toLowerCase().split("@")[0].replace(/[^a-z0-9._-]/g, "");
  if (!base) base = "admin";
  var tentativa = base;
  var n = 0;
  while (await Utilizador.findOne({ where: { username: tentativa } })) {
    n++;
    tentativa = base + n;
    if (n > 50) tentativa = base + Date.now().toString(36);
  }
  return tentativa;
};

var perfilAdministrador = async function () {
  var perfil = await Perfil.findOne({ where: { nome: "Administrador Geral" } });
  if (perfil) return perfil;
  perfil = await Perfil.findOne({ where: { nivel: { [Op.gte]: 4 } } });
  if (perfil) return perfil;
  return await Perfil.create({
    nome: "Administrador Geral",
    descricao: "Administrador da organização",
    nivel: 4,
    permissoes: {},
    activo: true,
  });
};

// ==================== LISTAGEM ====================

var listar = async function (req, res) {
  try {
    var orgs = await Organizacao.findAll({ order: [["nome", "ASC"]] });

    var saida = [];
    for (var i = 0; i < orgs.length; i++) {
      var org = orgs[i];
      var utilizadores = await Utilizador.count({ where: { organizacao_id: org.id } });
      var colaboradores = await Colaborador.count({ where: { organizacao_id: org.id } });
      saida.push({
        id: org.id,
        nome: org.nome,
        nome_curto: org.nome_curto,
        nif: org.nif,
        email: org.email,
        telefone: org.telefone,
        cidade: org.cidade,
        provincia: org.provincia,
        pais: org.pais,
        website: org.website,
        dominio: org.dominio,
        logo_url: org.logo_url,
        activo: org.activo !== false,
        utilizadores: utilizadores,
        colaboradores: colaboradores,
        createdAt: org.createdAt,
      });
    }

    return res.status(200).json({ dados: saida });
  } catch (e) {
    console.log("Erro ao listar organizacoes da plataforma:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var resumo = async function (req, res) {
  try {
    var total = await Organizacao.count();
    var activas = await Organizacao.count({ where: { activo: true } });
    var utilizadores = await Utilizador.count();
    var colaboradores = await Colaborador.count();
    return res.status(200).json({
      dados: {
        organizacoes: total,
        organizacoes_activas: activas,
        utilizadores: utilizadores,
        colaboradores: colaboradores,
      },
    });
  } catch (e) {
    console.log("Erro ao obter resumo da plataforma:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== CRIAR ====================

var criar = async function (req, res) {
  var t = await sequelize.transaction();
  try {
    var corpo = req.body || {};
    var dados = limparCampos(corpo);

    if (!dados.nome || !String(dados.nome).trim()) {
      await t.rollback();
      return res.status(400).json({ error: "O nome da organização é obrigatório" });
    }
    dados.nome = String(dados.nome).trim();
    dados.pais = dados.pais || "Angola";

    var erroUnico = await validarUnicos(dados, null);
    if (erroUnico) {
      await t.rollback();
      return res.status(409).json({ error: erroUnico });
    }

    // Primeiro administrador (opcional, mas recomendado). Sem ele a
    // organizacao fica sem ninguem que consiga entrar.
    var adminNome = corpo.admin_nome ? String(corpo.admin_nome).trim() : "";
    var adminEmail = corpo.admin_email ? String(corpo.admin_email).trim().toLowerCase() : "";
    var adminPassword = corpo.admin_password ? String(corpo.admin_password) : "";

    if (adminNome || adminEmail || adminPassword) {
      if (!adminNome || !adminEmail || !adminPassword) {
        await t.rollback();
        return res.status(400).json({ error: "Para criar o primeiro administrador indique nome, email e palavra-passe" });
      }
      if (adminPassword.length < 8) {
        await t.rollback();
        return res.status(400).json({ error: "A palavra-passe do administrador deve ter pelo menos 8 caracteres" });
      }
      var existeEmail = await Utilizador.findOne({ where: { email: adminEmail } });
      if (existeEmail) {
        await t.rollback();
        return res.status(409).json({ error: "Email do administrador já está em uso" });
      }
    }

    var organizacao = await Organizacao.create(
      Object.assign({}, dados, { activo: true }),
      { transaction: t }
    );

    var adminCriado = null;
    if (adminNome) {
      var perfil = await perfilAdministrador();
      var username = await gerarUsername(adminEmail);
      adminCriado = await Utilizador.create({
        nome_completo: adminNome,
        email: adminEmail,
        username: username,
        password: adminPassword,
        organizacao_id: organizacao.id,
        perfil_id: perfil ? perfil.id : null,
        activo: true,
        must_change_password: true,
        super_admin: false,
      }, { transaction: t });
    }

    await t.commit();

    return res.status(201).json({
      mensagem: adminCriado
        ? "Organização criada com o primeiro administrador"
        : "Organização criada. Crie um administrador para que possa entrar.",
      dados: {
        id: organizacao.id,
        nome: organizacao.nome,
        nome_curto: organizacao.nome_curto,
        activo: true,
        admin: adminCriado ? { id: adminCriado.id, nome: adminCriado.nome_completo, email: adminCriado.email, username: adminCriado.username } : null,
      },
    });
  } catch (e) {
    try { await t.rollback(); } catch (eRollback) { /* transacao ja fechada */ }
    console.log("Erro ao criar organizacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== EDITAR ====================

var actualizar = async function (req, res) {
  try {
    var organizacao = await Organizacao.findByPk(req.params.id);
    if (!organizacao) {
      return res.status(404).json({ error: "Organização não encontrada" });
    }

    var dados = limparCampos(req.body || {});
    if (dados.nome !== undefined && !String(dados.nome || "").trim()) {
      return res.status(400).json({ error: "O nome da organização não pode ficar vazio" });
    }

    var erroUnico = await validarUnicos(dados, organizacao.id);
    if (erroUnico) {
      return res.status(409).json({ error: erroUnico });
    }

    await organizacao.update(dados);

    return res.status(200).json({
      mensagem: "Organização actualizada",
      dados: organizacao,
    });
  } catch (e) {
    console.log("Erro ao actualizar organizacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== ACTIVAR / DESACTIVAR ====================

var alterarEstado = async function (req, res) {
  try {
    var organizacao = await Organizacao.findByPk(req.params.id);
    if (!organizacao) {
      return res.status(404).json({ error: "Organização não encontrada" });
    }

    var activo = !(req.body && (req.body.activo === false || req.body.activo === "false" || req.body.activo === 0));
    await organizacao.update({ activo: activo });

    return res.status(200).json({
      mensagem: activo ? "Organização activada" : "Organização desactivada",
      dados: { id: organizacao.id, activo: activo },
    });
  } catch (e) {
    console.log("Erro ao alterar estado da organizacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== REPOR PALAVRA-PASSE ====================

// Lista minima dos utilizadores de uma organizacao, apenas para o suporte
// escolher a conta a repor. Nao devolve palavras-passe nem dados internos.
var listarUtilizadores = async function (req, res) {
  try {
    var organizacao = await Organizacao.findByPk(req.params.id, { attributes: ["id", "nome"] });
    if (!organizacao) {
      return res.status(404).json({ error: "Organização não encontrada" });
    }

    var utilizadores = await Utilizador.findAll({
      where: { organizacao_id: organizacao.id, super_admin: false },
      attributes: ["id", "nome_completo", "email", "username", "activo", "bloqueado", "must_change_password"],
      include: [{ model: Perfil, as: "perfil", attributes: ["id", "nome"] }],
      order: [["nome_completo", "ASC"]],
    });

    return res.status(200).json({
      dados: {
        organizacao: { id: organizacao.id, nome: organizacao.nome },
        utilizadores: utilizadores,
      },
    });
  } catch (e) {
    console.log("Erro ao listar utilizadores da organizacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Define uma nova palavra-passe para uma conta da organizacao. O utilizador
// e obrigado a troca-la no proximo acesso e os bloqueios por tentativas sao
// limpos, para o suporte conseguir desbloquear o acesso.
var reporSenha = async function (req, res) {
  try {
    var nova = req.body && req.body.password ? String(req.body.password) : "";
    if (nova.length < 8) {
      return res.status(400).json({ error: "A nova palavra-passe deve ter pelo menos 8 caracteres" });
    }

    var utilizador = await Utilizador.findOne({
      where: {
        id: req.params.utilizadorId,
        organizacao_id: req.params.id,
        super_admin: false,
      },
    });
    if (!utilizador) {
      return res.status(404).json({ error: "Utilizador não encontrado nesta organização" });
    }

    await utilizador.update({
      password: nova,
      must_change_password: true,
      tentativas_login: 0,
      bloqueado: false,
    });

    return res.status(200).json({
      mensagem: "Palavra-passe reposta. O utilizador deve alterá-la no próximo acesso.",
      dados: {
        id: utilizador.id,
        nome_completo: utilizador.nome_completo,
        email: utilizador.email,
        username: utilizador.username,
      },
    });
  } catch (e) {
    console.log("Erro ao repor palavra-passe:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== LOGO ====================

var carregarLogo = async function (req, res) {
  try {
    var org = await Organizacao.findByPk(req.params.id);
    if (!org) return res.status(404).json({ error: "Organização não encontrada" });

    if (!req.files || !req.files.logo) {
      return res.status(400).json({ error: "Nenhum ficheiro enviado" });
    }

    var guardado = await guardarFicheiro({
      file: req.files.logo,
      pasta: "logos",
      organizacao_id: org.id,
      carregado_por: req.utilizador.id,
    });

    if (org.logo_url) {
      await apagarFicheiroDeUrl(org.logo_url);
    }

    var logoUrl = urlDoFicheiro(guardado) + "?v=" + Date.now();
    await org.update({ logo_url: logoUrl });

    return res.status(200).json({ mensagem: "Logo actualizado", dados: { logo_url: logoUrl } });
  } catch (e) {
    var limite = /demasiado grande/i.test(e.message);
    console.log("Erro ao carregar logo da organizacao:", e.message);
    return res.status(limite ? 413 : 500).json({ error: limite ? e.message : "Erro ao carregar o logo" });
  }
};

module.exports = { listar, resumo, criar, actualizar, alterarEstado, carregarLogo, listarUtilizadores, reporSenha };
