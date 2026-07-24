var { Op } = require("sequelize");
var { Organizacao } = require("../models");

var list = async function (req, res) {
  try {
    var where = {};
    if (req.query.search) {
      where[Op.or] = [
        { nome: { [Op.like]: "%" + req.query.search + "%" } },
        { nif: { [Op.like]: "%" + req.query.search + "%" } },
      ];
    }

    var organizacoes = await Organizacao.findAll({
      where: where,
      order: [["nome", "ASC"]],
    });

    return res.status(200).json({ dados: organizacoes });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getById = async function (req, res) {
  try {
    var organizacao = await Organizacao.findByPk(req.params.id);
    if (!organizacao) {
      return res.status(404).json({ error: "Organização não encontrada" });
    }
    return res.status(200).json({ dados: organizacao });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var create = async function (req, res) {
  try {
    var { nome, nif, email, telefone, endereco, cidade, provincia, pais, dominio } = req.body;

    if (!nome) {
      return res.status(400).json({ error: "Nome da organização é obrigatório" });
    }

    if (nif) {
      var existente = await Organizacao.findOne({ where: { nif: nif } });
      if (existente) {
        return res.status(409).json({ error: "NIF já está registado" });
      }
    }

    if (dominio) {
      var existente = await Organizacao.findOne({ where: { dominio: dominio } });
      if (existente) {
        return res.status(409).json({ error: "Domínio já está em uso" });
      }
    }

    var organizacao = await Organizacao.create({
      nome: nome,
      nif: nif || null,
      email: email || null,
      telefone: telefone || null,
      endereco: endereco || null,
      cidade: cidade || null,
      provincia: provincia || null,
      pais: pais || "Angola",
      dominio: dominio || null,
    });

    return res.status(201).json({
      mensagem: "Organização criada com sucesso",
      dados: organizacao,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var update = async function (req, res) {
  try {
    var organizacao = await Organizacao.findByPk(req.params.id);
    if (!organizacao) {
      return res.status(404).json({ error: "Organização não encontrada" });
    }

    var camposPermitidos = ["nome", "nome_curto", "nif", "email", "telefone", "endereco", "cidade", "provincia", "pais", "logo", "website", "dominio", "activo", "template_contrato", "logo_url"];
    var dadosActualizar = {};

    for (var i = 0; i < camposPermitidos.length; i++) {
      var campo = camposPermitidos[i];
      if (req.body[campo] !== undefined) {
        dadosActualizar[campo] = req.body[campo];
      }
    }

    if (dadosActualizar.nif) {
      var existente = await Organizacao.findOne({
        where: { nif: dadosActualizar.nif, id: { [Op.ne]: req.params.id } },
      });
      if (existente) {
        return res.status(409).json({ error: "NIF já está registado" });
      }
    }

    await organizacao.update(dadosActualizar);

    return res.status(200).json({
      mensagem: "Organização actualizada com sucesso",
      dados: organizacao,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var remove = async function (req, res) {
  try {
    var organizacao = await Organizacao.findByPk(req.params.id);
    if (!organizacao) {
      return res.status(404).json({ error: "Organização não encontrada" });
    }

    await organizacao.update({ activo: false });

    return res.status(200).json({ mensagem: "Organização desactivada com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { list, getById, create, update, remove };
