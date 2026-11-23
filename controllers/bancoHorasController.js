var { Op } = require("sequelize");
var {
  BancoHoraMovimento,
  Colaborador,
} = require("../models");
var { ORG_INEXISTENTE, orgDaSessao, incluirColaboradorDaOrg } = require("../helpers/organizacao");
var {
  calcularSaldo,
  calcularDesconto,
  justificarMovimento,
  liquidoMovimento,
} = require("../helpers/bancoHoras");

var resumoVazio = function () {
  return {
    saldo: 0,
    horas_devidas: 0,
    horas_credito: 0,
    movimentos: [],
  };
};

// Saldo do colaborador ligado ao utilizador da sessao.
var meuSaldo = async function (req, res) {
  try {
    var colaborador = await Colaborador.findOne({
      where: {
        utilizador_id: req.utilizador.id,
        organizacao_id: req.utilizador.organizacao_id || ORG_INEXISTENTE,
      },
    });
    if (!colaborador) return res.status(200).json({ dados: resumoVazio() });

    var saldo = await calcularSaldo(colaborador.id);
    return res.status(200).json({
      dados: {
        saldo: saldo.saldo,
        horas_devidas: saldo.horas_devidas,
        horas_credito: saldo.horas_credito,
        movimentos: saldo.movimentos.map(function (m) {
          return {
            id: m.id,
            data: m.data,
            tipo: m.tipo,
            horas: Number(m.horas),
            liquido: liquidoMovimento(m),
            observacoes: m.observacoes,
            estado: m.estado,
          };
        }),
      },
    });
  } catch (e) {
    console.log("Erro ao obter saldo do banco de horas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Lista de movimentos (admin), isolada por organizacao.
var listarMovimentos = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var where = {};

    if (req.query.colaborador_id) where.colaborador_id = req.query.colaborador_id;
    if (req.query.estado) where.estado = req.query.estado;
    if (req.query.tipo) where.tipo = req.query.tipo;
    if (req.query.data_inicio && req.query.data_fim) {
      where.data = { [Op.between]: [req.query.data_inicio, req.query.data_fim] };
    } else if (req.query.data_inicio) {
      where.data = { [Op.gte]: req.query.data_inicio };
    } else if (req.query.data_fim) {
      where.data = { [Op.lte]: req.query.data_fim };
    }

    var { count, rows } = await BancoHoraMovimento.findAndCountAll({
      where: where,
      include: [incluirColaboradorDaOrg(orgDaSessao(req))],
      distinct: true,
      order: [["data", "DESC"], ["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

    return res.status(200).json({
      dados: rows.map(function (m) {
        var obj = m.toJSON();
        obj.liquido = liquidoMovimento(m);
        return obj;
      }),
      paginacao: {
        total: count,
        pagina: page,
        limite: limit,
        total_paginas: Math.ceil(count / limit),
      },
    });
  } catch (e) {
    console.log("Erro ao listar movimentos do banco de horas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Resumo por colaborador (admin) — usado na pagina "Banco de Horas".
var resumoColaboradores = async function (req, res) {
  try {
    var colaboradores = await Colaborador.findAll({
      where: { organizacao_id: orgDaSessao(req) || ORG_INEXISTENTE },
      attributes: ["id", "nome_completo", "numero_colaborador", "estado"],
      order: [["nome_completo", "ASC"]],
    });

    var dados = [];
    for (var i = 0; i < colaboradores.length; i++) {
      var saldo = await calcularSaldo(colaboradores[i].id);
      if (req.query.apenas_com_saldo === "true" || req.query.apenas_com_saldo === "1") {
        if (saldo.saldo === 0 && saldo.horas_devidas === 0 && saldo.horas_credito === 0) continue;
      }
      dados.push({
        id: colaboradores[i].id,
        nome_completo: colaboradores[i].nome_completo,
        numero_colaborador: colaboradores[i].numero_colaborador,
        estado: colaboradores[i].estado,
        saldo: saldo.saldo,
        horas_devidas: saldo.horas_devidas,
        horas_credito: saldo.horas_credito,
      });
    }

    return res.status(200).json({ dados: dados });
  } catch (e) {
    console.log("Erro ao resumir banco de horas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Justificacao manual pelo administrador.
var justificar = async function (req, res) {
  try {
    var movimento = await BancoHoraMovimento.findOne({
      where: { id: req.params.id },
      include: [incluirColaboradorDaOrg(orgDaSessao(req), ["id"])],
    });
    if (!movimento) {
      return res.status(404).json({ error: "Movimento nao encontrado" });
    }
    if (movimento.estado !== "aberto") {
      return res.status(400).json({ error: "Este movimento ja nao pode ser justificado" });
    }

    await justificarMovimento(
      movimento,
      req.utilizador.id,
      req.body.observacoes || "Justificado manualmente pelo administrador"
    );

    return res.status(200).json({
      mensagem: "Movimento justificado com sucesso",
      dados: movimento,
    });
  } catch (e) {
    console.log("Erro ao justificar movimento do banco de horas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Previsao do desconto a aplicar na folha (mesmo calculo usado no pagamento).
var previewDesconto = async function (req, res) {
  try {
    var { colaborador_id, mes, ano } = req.query;
    if (!colaborador_id || !mes || !ano) {
      return res.status(400).json({ error: "colaborador_id, mes e ano sao obrigatorios" });
    }
    var apenasMes = req.query.apenas_mes === "true" || req.query.apenas_mes === "1";
    var detalhe = await calcularDesconto(
      colaborador_id,
      parseInt(mes),
      parseInt(ano),
      apenasMes,
      null,
      req.query.salario_base
    );
    return res.status(200).json({ dados: detalhe });
  } catch (e) {
    console.log("Erro ao prever desconto do banco de horas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = {
  meuSaldo,
  listarMovimentos,
  resumoColaboradores,
  justificar,
  previewDesconto,
};
