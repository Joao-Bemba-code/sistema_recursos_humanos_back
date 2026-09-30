var { Op } = require("sequelize");
var { sequelize, Credito, CreditoMovimento, Colaborador } = require("../models");

var arredondar = function (v) { return Math.round(v * 100) / 100; };
var toNum = function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; };

// ==================== HELPERS DE DESCONTO (usados pela folha salarial) ====================

// Calcula (sem escrever) o desconto de credito de um colaborador para um mes/ano.
// maxDesconto limita o total para que o salario liquido nao fique negativo.
var calcularDescontosCreditos = async function (colaborador_id, maxDesconto, options) {
  try {
    var creditos = await Credito.findAll({
      where: { colaborador_id: colaborador_id, estado: "Ativo" },
      order: [["createdAt", "ASC"]],
      transaction: options && options.transaction,
    });

    var total = 0;
    var detalhes = [];

    for (var i = 0; i < creditos.length; i++) {
      var c = creditos[i];
      var restante = arredondar(toNum(c.valor) - toNum(c.valor_pago));
      if (restante <= 0) continue;

      var desconto = arredondar(Math.min(toNum(c.desconto_mensal), restante));
      if (desconto <= 0) continue;

      var disponivel = arredondar(toNum(maxDesconto) - total);
      if (disponivel <= 0) break;
      if (desconto > disponivel) desconto = disponivel;

      total = arredondar(total + desconto);
      detalhes.push({ credito_id: c.id, desconto: desconto });
    }

    return { total: total, detalhes: detalhes };
  } catch (e) {
    console.log("Erro ao calcular descontos de creditos:", e.message);
    return { total: 0, detalhes: [] };
  }
};

// Aplica (escreve) os descontos: actualiza valor_pago/estado e cria movimentos.
var registarDescontosCreditos = async function (colaborador_id, mes, ano, pagamento_id, maxDesconto, t) {
  try {
    var creditos = await Credito.findAll({
      where: { colaborador_id: colaborador_id, estado: "Ativo" },
      order: [["createdAt", "ASC"]],
      transaction: t,
    });

    var total = 0;
    var movimentos = [];

    for (var i = 0; i < creditos.length; i++) {
      var c = creditos[i];
      var restante = arredondar(toNum(c.valor) - toNum(c.valor_pago));
      if (restante <= 0) continue;

      var desconto = arredondar(Math.min(toNum(c.desconto_mensal), restante));
      if (desconto <= 0) continue;

      var disponivel = arredondar(toNum(maxDesconto) - total);
      if (disponivel <= 0) break;
      if (desconto > disponivel) desconto = disponivel;

      var novoPago = arredondar(toNum(c.valor_pago) + desconto);
      var novoEstado = novoPago >= toNum(c.valor) - 0.005 ? "Pago" : "Ativo";

      await c.update({ valor_pago: novoPago, estado: novoEstado }, { transaction: t });

      var movimento = await CreditoMovimento.create({
        credito_id: c.id,
        colaborador_id: colaborador_id,
        pagamento_id: pagamento_id,
        mes: parseInt(mes),
        ano: parseInt(ano),
        valor_descontado: desconto,
      }, { transaction: t });

      movimentos.push(movimento);
      total = arredondar(total + desconto);
    }

    return { total: total, movimentos: movimentos };
  } catch (e) {
    console.log("Erro ao registar descontos de creditos:", e.message);
    throw e;
  }
};

// ==================== ENDPOINTS ====================

var listCreditos = async function (req, res) {
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

    var { count, rows } = await Credito.findAndCountAll({
      where: where,
      include: include,
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
    console.log("Erro ao listar creditos:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getCredito = async function (req, res) {
  try {
    var credito = await Credito.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
        { model: CreditoMovimento, as: "movimentos", order: [["ano", "DESC"], ["mes", "DESC"]] },
      ],
    });

    if (!credito) {
      return res.status(404).json({ error: "Credito nao encontrado" });
    }

    return res.status(200).json({ dados: credito });
  } catch (e) {
    console.log("Erro ao buscar credito:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getResumo = async function (req, res) {
  try {
    var ativos = await Credito.findAll({ where: { estado: "Ativo" } });

    var totalEmprestado = 0;
    var dividaTotal = 0;
    var totalPago = 0;

    for (var i = 0; i < ativos.length; i++) {
      var c = ativos[i];
      totalEmprestado = arredondar(totalEmprestado + toNum(c.valor));
      dividaTotal = arredondar(dividaTotal + Math.max(0, toNum(c.valor) - toNum(c.valor_pago)));
      totalPago = arredondar(totalPago + toNum(c.valor_pago));
    }

    var outrosPagos = await Credito.findAll({ where: { estado: "Pago" } });
    for (var j = 0; j < outrosPagos.length; j++) {
      totalPago = arredondar(totalPago + toNum(outrosPagos[j].valor_pago));
    }

    return res.status(200).json({
      dados: {
        creditos_ativos: ativos.length,
        total_emprestado: totalEmprestado,
        divida_total: dividaTotal,
        total_pago: totalPago,
      },
    });
  } catch (e) {
    console.log("Erro ao obter resumo de creditos:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var validarDados = function (dados) {
  if (!dados.colaborador_id) return "Seleccione o colaborador";
  if (toNum(dados.valor) <= 0) return "O valor do credito deve ser maior que zero";
  if (toNum(dados.desconto_mensal) <= 0) return "O desconto mensal deve ser maior que zero";
  if (!dados.data_concessao) return "A data de concessao e obrigatoria";
  return null;
};

var createCredito = async function (req, res) {
  try {
    var dados = req.body;

    var erroValidacao = validarDados(dados);
    if (erroValidacao) {
      return res.status(400).json({ error: erroValidacao });
    }

    var colaborador = await Colaborador.findByPk(dados.colaborador_id);
    if (!colaborador) {
      return res.status(404).json({ error: "Colaborador nao encontrado" });
    }

    var credito = await Credito.create({
      colaborador_id: dados.colaborador_id,
      valor: toNum(dados.valor),
      desconto_mensal: toNum(dados.desconto_mensal),
      valor_pago: 0,
      data_concessao: dados.data_concessao,
      motivo: dados.motivo || null,
      estado: "Ativo",
      criado_por: req.utilizador ? req.utilizador.id : null,
    });

    return res.status(201).json({
      mensagem: "Credito criado com sucesso",
      dados: credito,
    });
  } catch (e) {
    console.log("Erro ao criar credito:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var updateCredito = async function (req, res) {
  try {
    var credito = await Credito.findByPk(req.params.id);
    if (!credito) {
      return res.status(404).json({ error: "Credito nao encontrado" });
    }

    if (credito.estado !== "Ativo") {
      return res.status(400).json({ error: "So e possivel editar creditos activos" });
    }

    var dados = req.body;

    if (dados.valor !== undefined && toNum(dados.valor) !== toNum(credito.valor) && toNum(credito.valor_pago) > 0) {
      return res.status(400).json({ error: "Nao e possivel alterar o valor apos ja haver descontos registados" });
    }

    var dadosActualizar = {};

    if (dados.desconto_mensal !== undefined) {
      if (toNum(dados.desconto_mensal) <= 0) {
        return res.status(400).json({ error: "O desconto mensal deve ser maior que zero" });
      }
      dadosActualizar.desconto_mensal = toNum(dados.desconto_mensal);
    }

    if (dados.valor !== undefined) {
      if (toNum(dados.valor) <= 0) {
        return res.status(400).json({ error: "O valor do credito deve ser maior que zero" });
      }
      if (toNum(dados.valor) < toNum(credito.valor_pago)) {
        return res.status(400).json({ error: "O valor nao pode ser menor que o ja descontado" });
      }
      dadosActualizar.valor = toNum(dados.valor);
    }

    if (dados.motivo !== undefined) dadosActualizar.motivo = dados.motivo;
    if (dados.data_concessao !== undefined && dados.data_concessao) dadosActualizar.data_concessao = dados.data_concessao;

    await credito.update(dadosActualizar);

    var actualizado = await Credito.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Credito actualizado com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    console.log("Erro ao actualizar credito:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var cancelarCredito = async function (req, res) {
  try {
    var credito = await Credito.findByPk(req.params.id);
    if (!credito) {
      return res.status(404).json({ error: "Credito nao encontrado" });
    }

    if (credito.estado === "Pago") {
      return res.status(400).json({ error: "Este credito ja esta totalmente pago" });
    }

    if (credito.estado === "Cancelado") {
      return res.status(400).json({ error: "Este credito ja esta cancelado" });
    }

    await credito.update({ estado: "Cancelado" });

    return res.status(200).json({ mensagem: "Credito cancelado. Nao serao feitos mais descontos.", dados: credito });
  } catch (e) {
    console.log("Erro ao cancelar credito:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var removeCredito = async function (req, res) {
  try {
    var credito = await Credito.findByPk(req.params.id);
    if (!credito) {
      return res.status(404).json({ error: "Credito nao encontrado" });
    }

    var movimentos = await CreditoMovimento.count({ where: { credito_id: credito.id } });
    if (movimentos > 0) {
      return res.status(400).json({ error: "Nao e possivel eliminar um credito que ja tem descontos registados. Use Cancelar." });
    }

    await credito.destroy();

    return res.status(200).json({ mensagem: "Credito eliminado com sucesso" });
  } catch (e) {
    console.log("Erro ao eliminar credito:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = {
  listCreditos,
  getCredito,
  getResumo,
  createCredito,
  updateCredito,
  cancelarCredito,
  removeCredito,
  calcularDescontosCreditos,
  registarDescontosCreditos,
};
