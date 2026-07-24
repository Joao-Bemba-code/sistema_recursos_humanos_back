var { Op } = require("sequelize");
var { Vencimento, Pagamento, Colaborador } = require("../models");

// ==================== VENCIMENTOS ====================

var listVencimentos = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var colaborador_id = req.query.colaborador_id;

    var where = {};
    if (estado) where.estado = estado;
    if (colaborador_id) where.colaborador_id = colaborador_id;

    var include = [
      { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
    ];

    if (search) {
      include[0].where = { nome_completo: { [Op.like]: "%" + search + "%" } };
    }

    var { count, rows } = await Vencimento.findAndCountAll({
      where: where,
      include: include,
      order: [["data_inicio", "DESC"]],
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
    console.log("Erro ao listar vencimentos:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getVencimento = async function (req, res) {
  try {
    var vencimento = await Vencimento.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    if (!vencimento) {
      return res.status(404).json({ error: "Vencimento nao encontrado" });
    }

    return res.status(200).json({ dados: vencimento });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var calcularTotais = function (dados) {
  var salarioBase = parseFloat(dados.salario_base) || 0;
  var subAlim = parseFloat(dados.subsidio_alimentacao) || 0;
  var subTrans = parseFloat(dados.subsidio_transporte) || 0;
  var subEduca = parseFloat(dados.subsidio_educacao) || 0;
  var outrosSub = parseFloat(dados.outros_subsidios) || 0;

  dados.total_bruto = Math.round((salarioBase + subAlim + subTrans + subEduca + outrosSub) * 100) / 100;

  var descIrt = parseFloat(dados.desconto_irt) || 0;
  var descSS = parseFloat(dados.desconto_seguranca_social) || 0;
  var outrosDesc = parseFloat(dados.outros_descontos) || 0;

  dados.total_liquido = Math.round((dados.total_bruto - descIrt - descSS - outrosDesc) * 100) / 100;

  return dados;
};

var createVencimento = async function (req, res) {
  try {
    var dados = req.body;

    if (!dados.colaborador_id || !dados.salario_base || !dados.data_inicio) {
      return res.status(400).json({ error: "colaborador_id, salario_base e data_inicio sao obrigatorios" });
    }

    dados = calcularTotais(dados);

    if (!dados.total_bruto) dados.total_bruto = dados.salario_base;
    if (!dados.total_liquido) dados.total_liquido = dados.total_bruto;

    var vencimento = await Vencimento.create(dados);

    return res.status(201).json({
      mensagem: "Vencimento criado com sucesso",
      dados: vencimento,
    });
  } catch (e) {
    console.log("Erro ao criar vencimento:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var updateVencimento = async function (req, res) {
  try {
    var vencimento = await Vencimento.findByPk(req.params.id);
    if (!vencimento) {
      return res.status(404).json({ error: "Vencimento nao encontrado" });
    }

    var camposProtegidos = ["id", "colaborador_id", "createdAt", "updatedAt"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    var dadosCompletos = {
      salario_base: dadosActualizar.salario_base || vencimento.salario_base,
      subsidio_alimentacao: dadosActualizar.subsidio_alimentacao !== undefined ? dadosActualizar.subsidio_alimentacao : vencimento.subsidio_alimentacao,
      subsidio_transporte: dadosActualizar.subsidio_transporte !== undefined ? dadosActualizar.subsidio_transporte : vencimento.subsidio_transporte,
      subsidio_educacao: dadosActualizar.subsidio_educacao !== undefined ? dadosActualizar.subsidio_educacao : vencimento.subsidio_educacao,
      outros_subsidios: dadosActualizar.outros_subsidios !== undefined ? dadosActualizar.outros_subsidios : vencimento.outros_subsidios,
      desconto_irt: dadosActualizar.desconto_irt !== undefined ? dadosActualizar.desconto_irt : vencimento.desconto_irt,
      desconto_seguranca_social: dadosActualizar.desconto_seguranca_social !== undefined ? dadosActualizar.desconto_seguranca_social : vencimento.desconto_seguranca_social,
      outros_descontos: dadosActualizar.outros_descontos !== undefined ? dadosActualizar.outros_descontos : vencimento.outros_descontos,
    };

    var totais = calcularTotais(dadosCompletos);
    dadosActualizar.total_bruto = totais.total_bruto;
    dadosActualizar.total_liquido = totais.total_liquido;

    await vencimento.update(dadosActualizar);

    var actualizado = await Vencimento.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Vencimento actualizado com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var removeVencimentos = async function (req, res) {
  try {
    var vencimento = await Vencimento.findByPk(req.params.id);
    if (!vencimento) {
      return res.status(404).json({ error: "Vencimento nao encontrado" });
    }

    await vencimento.destroy();

    return res.status(200).json({ mensagem: "Vencimento eliminado com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== PAGAMENTOS ====================

var listPagamentos = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var colaborador_id = req.query.colaborador_id;
    var mes = req.query.mes;
    var ano = req.query.ano;

    var where = {};
    if (estado) where.estado = estado;
    if (colaborador_id) where.colaborador_id = colaborador_id;
    if (mes) where.mes = mes;
    if (ano) where.ano = ano;

    var include = [
      { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
    ];

    if (search) {
      include[0].where = { nome_completo: { [Op.like]: "%" + search + "%" } };
    }

    var { count, rows } = await Pagamento.findAndCountAll({
      where: where,
      include: include,
      order: [["ano", "DESC"], ["mes", "DESC"]],
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
    console.log("Erro ao listar pagamentos:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var createPagamento = async function (req, res) {
  try {
    var dados = req.body;

    if (!dados.colaborador_id || !dados.mes || !dados.ano || !dados.salario_base) {
      return res.status(400).json({ error: "colaborador_id, mes, ano e salario_base sao obrigatorios" });
    }

    var existente = await Pagamento.findOne({
      where: { colaborador_id: dados.colaborador_id, mes: dados.mes, ano: dados.ano },
    });
    if (existente) {
      return res.status(409).json({ error: "Ja existe pagamento registado para este colaborador neste mes/ano" });
    }

    var pagamento = await Pagamento.create(dados);

    return res.status(201).json({
      mensagem: "Pagamento criado com sucesso",
      dados: pagamento,
    });
  } catch (e) {
    console.log("Erro ao criar pagamento:", e.message);
    if (e.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Ja existe pagamento registado para este colaborador neste mes/ano" });
    }
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var updatePagamento = async function (req, res) {
  try {
    var pagamento = await Pagamento.findByPk(req.params.id);
    if (!pagamento) {
      return res.status(404).json({ error: "Pagamento nao encontrado" });
    }

    var camposProtegidos = ["id", "colaborador_id", "mes", "ano", "createdAt", "updatedAt"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    await pagamento.update(dadosActualizar);

    var actualizado = await Pagamento.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Pagamento actualizado com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { listVencimentos, getVencimento, createVencimento, updateVencimento, removeVencimentos, listPagamentos, createPagamento, updatePagamento };
