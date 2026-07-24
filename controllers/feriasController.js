var { Op } = require("sequelize");
var { SolicitacaoFerias, Colaborador } = require("../models");

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var colaborador_id = req.query.colaborador_id;

    var where = {};
    if (search) {
      where[Op.or] = [
        { motivo: { [Op.like]: "%" + search + "%" } },
        { observacoes_aprovacao: { [Op.like]: "%" + search + "%" } },
      ];
    }
    if (estado) where.estado = estado;
    if (colaborador_id) where.colaborador_id = colaborador_id;

    var { count, rows } = await SolicitacaoFerias.findAndCountAll({
      where: where,
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
      order: [["createdAt", "DESC"]],
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
    console.log("Erro ao listar solicitacoes de ferias:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getById = async function (req, res) {
  try {
    var solicitacao = await SolicitacaoFerias.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    if (!solicitacao) {
      return res.status(404).json({ error: "Solicitacao de ferias nao encontrada" });
    }

    return res.status(200).json({ dados: solicitacao });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var create = async function (req, res) {
  try {
    var dados = req.body;

    if (!dados.colaborador_id || !dados.data_inicio || !dados.data_fim || !dados.dias_solicitados) {
      return res.status(400).json({ error: "colaborador_id, data_inicio, data_fim e dias_solicitados sao obrigatorios" });
    }

    var solicitacao = await SolicitacaoFerias.create(dados);

    return res.status(201).json({
      mensagem: "Solicitacao de ferias criada com sucesso",
      dados: solicitacao,
    });
  } catch (e) {
    console.log("Erro ao criar solicitacao de ferias:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var update = async function (req, res) {
  try {
    var solicitacao = await SolicitacaoFerias.findByPk(req.params.id);
    if (!solicitacao) {
      return res.status(404).json({ error: "Solicitacao de ferias nao encontrada" });
    }

    var camposProtegidos = ["id", "colaborador_id", "createdAt", "updatedAt"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    if (req.body.estado === "Aprovado") {
      dadosActualizar.data_aprovacao = new Date();
      dadosActualizar.aprovado_por = req.utilizador ? req.utilizador.id : null;
    }

    await solicitacao.update(dadosActualizar);

    var actualizado = await SolicitacaoFerias.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Solicitacao de ferias actualizada com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var remove = async function (req, res) {
  try {
    var solicitacao = await SolicitacaoFerias.findByPk(req.params.id);
    if (!solicitacao) {
      return res.status(404).json({ error: "Solicitacao de ferias nao encontrada" });
    }

    await solicitacao.destroy();

    return res.status(200).json({ mensagem: "Solicitacao de ferias eliminada com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { list, getById, create, update, remove };
