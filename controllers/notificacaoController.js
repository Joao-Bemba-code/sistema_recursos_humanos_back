var { Op } = require("sequelize");
var { sequelize } = require("../config");
var { Notificacao } = require("../models");

var temColunaModulo = null;
var verificarColunaModulo = async function () {
  if (temColunaModulo !== null) return temColunaModulo;
  try {
    var res = await sequelize.query("SHOW COLUMNS FROM `notificacoes` LIKE 'modulo'");
    var linhas = Array.isArray(res[0]) ? res[0] : res;
    temColunaModulo = linhas.length > 0;
  } catch (e) {
    temColunaModulo = false;
  }
  return temColunaModulo;
};

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var lida = req.query.lida;

    var where = {
      organizacao_id: req.utilizador.organizacao_id,
      utilizador_id: req.utilizador.id,
    };

    if (lida !== undefined) {
      where.lida = lida === "true" || lida === "1";
    }

    var opcoes = {
      where: where,
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    };
    if (!(await verificarColunaModulo())) {
      opcoes.attributes = { exclude: ["modulo"] };
    }

    var { count, rows } = await Notificacao.findAndCountAll(opcoes);

    var naoLidas = await Notificacao.count({
      where: {
        organizacao_id: req.utilizador.organizacao_id,
        utilizador_id: req.utilizador.id,
        lida: false,
      },
    });

    return res.status(200).json({
      dados: rows,
      nao_lidas: naoLidas,
      paginacao: {
        total: count,
        pagina: page,
        limite: limit,
        total_paginas: Math.ceil(count / limit),
      },
    });
  } catch (e) {
    console.log("Erro ao listar notificacoes:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var markRead = async function (req, res) {
  try {
    var opcoes = {
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
        utilizador_id: req.utilizador.id,
      },
    };
    if (!(await verificarColunaModulo())) {
      opcoes.attributes = { exclude: ["modulo"] };
    }

    var notificacao = await Notificacao.findOne(opcoes);

    if (!notificacao) {
      return res.status(404).json({ error: "Notificacao nao encontrada" });
    }

    await notificacao.update({ lida: true });

    return res.status(200).json({
      mensagem: "Notificacao marcada como lida",
      dados: notificacao,
    });
  } catch (e) {
    console.log("Erro ao marcar notificacao como lida:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var markAllRead = async function (req, res) {
  try {
    var actualizadas = await Notificacao.update(
      { lida: true },
      {
        where: {
          organizacao_id: req.utilizador.organizacao_id,
          utilizador_id: req.utilizador.id,
          lida: false,
        },
      }
    );

    return res.status(200).json({
      mensagem: "Todas as notificacoes marcadas como lidas",
      total: actualizadas[0],
    });
  } catch (e) {
    console.log("Erro ao marcar todas como lidas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var create = async function (data) {
  try {
    var dados = {
      organizacao_id: data.organizacao_id,
      utilizador_id: data.utilizador_id,
      titulo: data.titulo,
      mensagem: data.mensagem,
      tipo: data.tipo || "info",
      lida: false,
      link: data.link || null,
    };
    if (await verificarColunaModulo()) {
      dados.modulo = data.modulo || null;
    }

    var notificacao = await Notificacao.create(dados);

    return notificacao;
  } catch (e) {
    console.log("Erro ao criar notificacao:", e.message);
    return null;
  }
};

module.exports = { list, markRead, markAllRead, create };
