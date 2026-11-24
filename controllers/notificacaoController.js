var { Op } = require("sequelize");
var { sequelize } = require("../config");
var { Notificacao, NotificacaoPush } = require("../models");
var {
  hashEndpoint,
  validarSubscricaoPush,
  obterConfiguracaoVapid,
  enviarPushNotificacao,
} = require("../helpers/notificacaoPush");

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

var pushConfig = async function (req, res) {
  var config = obterConfiguracaoVapid();
  return res.status(200).json({
    ativo: !!config,
    chave_publica: config ? config.chave_publica : null,
  });
};

var subscribePush = async function (req, res) {
  try {
    if (!req.utilizador.organizacao_id || req.utilizador.super_admin) {
      return res.status(403).json({ error: "Esta conta nao pode receber notificacoes push" });
    }

    var entrada = req.body && req.body.subscricao ? req.body.subscricao : req.body;
    var validacao = validarSubscricaoPush(entrada);
    if (validacao.erro) {
      return res.status(400).json({ error: validacao.erro });
    }

    var dados = validacao.valor;
    dados.organizacao_id = req.utilizador.organizacao_id;
    dados.utilizador_id = req.utilizador.id;
    dados.ativo = true;
    dados.ultimo_acesso = new Date();

    var existente = await NotificacaoPush.findOne({
      where: { endpoint_hash: hashEndpoint(dados.endpoint) },
    });

    if (existente) {
      await existente.update(dados);
      return res.status(200).json({ mensagem: "Subscricao de notificacoes actualizada" });
    }

    try {
      await NotificacaoPush.create(dados);
    } catch (erroCriar) {
      // Duas abas podem subscrever o mesmo endpoint ao mesmo tempo.
      if (!erroCriar.name || erroCriar.name.indexOf("UniqueConstraint") === -1) throw erroCriar;
      await NotificacaoPush.update(dados, {
        where: { endpoint_hash: dados.endpoint_hash },
      });
    }

    return res.status(201).json({ mensagem: "Notificacoes push activadas neste dispositivo" });
  } catch (e) {
    console.log("Erro ao subscrever notificacoes push:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var unsubscribePush = async function (req, res) {
  try {
    var endpoint = String(req.body && req.body.endpoint || "").trim();
    if (!endpoint || endpoint.length > 2048) {
      return res.status(400).json({ error: "Endpoint de notificacoes invalido" });
    }

    var removidas = await NotificacaoPush.destroy({
      where: {
        endpoint_hash: hashEndpoint(endpoint),
        organizacao_id: req.utilizador.organizacao_id,
        utilizador_id: req.utilizador.id,
      },
    });

    return res.status(200).json({
      mensagem: "Notificacoes push desactivadas neste dispositivo",
      removidas: removidas,
    });
  } catch (e) {
    console.log("Erro ao remover subscricao push:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var pushStatus = async function (req, res) {
  try {
    var total = await NotificacaoPush.count({
      where: {
        organizacao_id: req.utilizador.organizacao_id,
        utilizador_id: req.utilizador.id,
        ativo: true,
      },
    });
    return res.status(200).json({ dispositivos: total });
  } catch (e) {
    console.log("Erro ao consultar subscricoes push:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var testPush = async function (req, res) {
  var notificacao = await create({
    organizacao_id: req.utilizador.organizacao_id,
    utilizador_id: req.utilizador.id,
    titulo: "Notificacoes activadas",
    mensagem: "Esta e uma notificacao de teste do SGHR. Os proximos avisos podem aparecer mesmo com o site fechado.",
    tipo: "success",
    link: "/dashboard",
    modulo: "sistema",
  });

  if (!notificacao) {
    return res.status(500).json({ error: "Nao foi possivel enviar a notificacao de teste" });
  }

  return res.status(202).json({
    mensagem: "Notificacao de teste enviada",
    dados: notificacao,
  });
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

    // A notificacao dentro do site e a fonte principal. O push e disparado em
    // paralelo para nao atrasar a operacao que gerou o aviso.
    enviarPushNotificacao(notificacao).catch(function () {});

    return notificacao;
  } catch (e) {
    console.log("Erro ao criar notificacao:", e.message);
    return null;
  }
};

module.exports = {
  list,
  markRead,
  markAllRead,
  create,
  pushConfig,
  subscribePush,
  unsubscribePush,
  pushStatus,
  testPush,
};
