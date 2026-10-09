var { Op } = require("sequelize");
var { sequelize, Credito, CreditoMovimento, Colaborador } = require("../models");

var arredondar = function (v) { return Math.round(v * 100) / 100; };
var toNum = function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; };

// ==================== HELPERS DE DESCONTO (usados pela folha salarial) ====================

// Lista os meses devidos entre a data de concessao (inclusive) e o mes da folha (inclusive).
// O mes da concessao conta como primeira quota. Retorna null quando nao ha data de
// concessao (creditos antigos) — nesse caso mantem-se o comportamento de 1 quota por folha.
var mesesDevidos = function (dataConcessao, mes, ano) {
  var d = dataConcessao ? new Date(dataConcessao) : null;
  if (!d || isNaN(d.getTime())) return null;
  var inicio = d.getFullYear() * 12 + (d.getMonth() + 1);
  var fim = parseInt(ano) * 12 + parseInt(mes);
  var lista = [];
  if (fim < inicio) return lista; // concessao posterior a folha: nada devido
  for (var m = inicio; m <= fim; m++) {
    lista.push({ ano: Math.floor((m - 1) / 12), mes: ((m - 1) % 12) + 1 });
  }
  return lista;
};

// Plano de desconto (catch-up por mes): por cada credito activo, calcula os movimentos
// em falta — uma quota por mes desde a concessao, menos o que ja foi descontado nesse
// mes. O total fica limitado a maxDesconto (para o liquido nao ficar negativo).
var planoDescontosCreditos = async function (colaborador_id, mes, ano, maxDesconto, t) {
  var creditos = await Credito.findAll({
    where: { colaborador_id: colaborador_id, estado: "Ativo" },
    order: [["createdAt", "ASC"]],
    transaction: t,
  });

  var total = 0;
  var itens = [];

  for (var i = 0; i < creditos.length; i++) {
    var c = creditos[i];
    var restante = arredondar(toNum(c.valor) - toNum(c.valor_pago));
    var quota = toNum(c.desconto_mensal);
    if (restante <= 0 || quota <= 0) continue;

    var devidos = mesesDevidos(c.data_concessao, mes, ano);
    var movimentos = [];

    if (devidos === null) {
      // Credito sem data de concessao: desconto fixo de uma quota (comportamento antigo)
      var v0 = arredondar(Math.min(quota, restante, Math.max(0, toNum(maxDesconto) - total)));
      if (v0 > 0) {
        movimentos.push({ mes: parseInt(mes), ano: parseInt(ano), valor: v0 });
        total = arredondar(total + v0);
      }
    } else {
      // Soma do que ja foi descontado em cada mes (movimentos existentes)
      var movsExistentes = await CreditoMovimento.findAll({ where: { credito_id: c.id }, transaction: t });
      var pagoPorMes = {};
      movsExistentes.forEach(function (mv) {
        var chave = mv.ano + "-" + mv.mes;
        pagoPorMes[chave] = toNum(pagoPorMes[chave]) + toNum(mv.valor_descontado);
      });

      for (var j = 0; j < devidos.length; j++) {
        if (restante <= 0) break;
        var dm = devidos[j];
        var chave = dm.ano + "-" + dm.mes;
        var emFalta = arredondar(quota - toNum(pagoPorMes[chave] || 0));
        if (emFalta <= 0) continue;

        var disponivel = arredondar(toNum(maxDesconto) - total);
        if (disponivel <= 0) break;

        var v = arredondar(Math.min(emFalta, restante, disponivel));
        if (v <= 0) continue;

        movimentos.push({ mes: dm.mes, ano: dm.ano, valor: v });
        total = arredondar(total + v);
        restante = arredondar(restante - v);
      }
    }

    if (movimentos.length > 0) {
      itens.push({ credito: c, movimentos: movimentos });
    }
  }

  return { total: total, itens: itens };
};

// Constroi automaticamente o plano de descontos de um credito: um mes por quota,
// a partir da data de concessao, assinalando o que ja foi pago (movimentos),
// o que esta parcial e o que esta pendente. Nao depende da folha estar processada.
var construirPlano = function (credito, movimentos) {
  var quota = toNum(credito.desconto_mensal);
  var valor = toNum(credito.valor);
  if (quota <= 0 || valor <= 0) return [];

  var pagoPorMes = {};
  (movimentos || []).forEach(function (m) {
    var chave = m.ano + "-" + m.mes;
    pagoPorMes[chave] = arredondar(toNum(pagoPorMes[chave]) + toNum(m.valor_descontado));
  });

  var d = credito.data_concessao ? new Date(credito.data_concessao) : null;
  var refAno, refMes;
  if (d && !isNaN(d.getTime())) {
    refAno = d.getFullYear();
    refMes = d.getMonth() + 1;
  } else if (movimentos && movimentos.length > 0) {
    var primeiro = movimentos.slice().sort(function (a, b) { return (a.ano * 12 + a.mes) - (b.ano * 12 + b.mes); })[0];
    refAno = primeiro.ano;
    refMes = primeiro.mes;
  } else {
    refAno = new Date().getFullYear();
    refMes = new Date().getMonth() + 1;
  }

  var totalMeses = Math.ceil(arredondar(valor / quota));
  if (totalMeses > 600) totalMeses = 600;

  var plano = [];
  var restante = valor;
  var cursor = refAno * 12 + (refMes - 1);
  for (var i = 0; i < totalMeses; i++) {
    var ano = Math.floor(cursor / 12);
    var mes = (cursor % 12) + 1;
    var previsto = arredondar(Math.min(quota, restante));
    var pago = toNum(pagoPorMes[ano + "-" + mes]);
    var estado = pago >= previsto - 0.005 ? "Pago" : (pago > 0 ? "Parcial" : "Pendente");
    plano.push({ mes: mes, ano: ano, previsto: previsto, pago: pago, estado: estado });
    restante = arredondar(restante - previsto);
    cursor++;
    if (restante <= 0) break;
  }
  return plano;
};

// Calcula (sem escrever) o desconto de credito de um colaborador para um mes/ano.
// maxDesconto limita o total para que o salario liquido nao fique negativo.
var calcularDescontosCreditos = async function (colaborador_id, mes, ano, maxDesconto, options) {
  try {
    var plano = await planoDescontosCreditos(colaborador_id, mes, ano, maxDesconto, options && options.transaction);
    var detalhes = [];
    plano.itens.forEach(function (item) {
      var soma = 0;
      item.movimentos.forEach(function (mv) { soma = arredondar(soma + mv.valor); });
      detalhes.push({ credito_id: item.credito.id, desconto: soma });
    });
    return { total: plano.total, detalhes: detalhes };
  } catch (e) {
    console.log("Erro ao calcular descontos de creditos:", e.message);
    return { total: 0, detalhes: [] };
  }
};

// Aplica (escreve) os descontos: actualiza valor_pago/estado e cria um movimento por mes em falta.
var registarDescontosCreditos = async function (colaborador_id, mes, ano, pagamento_id, maxDesconto, t) {
  try {
    var plano = await planoDescontosCreditos(colaborador_id, mes, ano, maxDesconto, t);
    var movimentos = [];

    for (var i = 0; i < plano.itens.length; i++) {
      var item = plano.itens[i];
      var c = item.credito;
      var soma = 0;

      for (var j = 0; j < item.movimentos.length; j++) {
        var mv = item.movimentos[j];
        var movimento = await CreditoMovimento.create({
          credito_id: c.id,
          colaborador_id: colaborador_id,
          pagamento_id: pagamento_id,
          mes: parseInt(mv.mes),
          ano: parseInt(mv.ano),
          valor_descontado: mv.valor,
        }, { transaction: t });
        movimentos.push(movimento);
        soma = arredondar(soma + mv.valor);
      }

      var novoPago = arredondar(toNum(c.valor_pago) + soma);
      var novoEstado = novoPago >= toNum(c.valor) - 0.005 ? "Pago" : "Ativo";
      await c.update({ valor_pago: novoPago, estado: novoEstado }, { transaction: t });
    }

    return { total: plano.total, movimentos: movimentos };
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

    var dados = credito.toJSON();
    dados.plano = construirPlano(credito, credito.movimentos || []);

    return res.status(200).json({ dados: dados });
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

// Regulariza manualmente um mes: marca uma quota como paga sem depender de
// uma folha salarial (movimento com pagamento_id nulo). O calculo automatico
// passa a ignorar esse mes, porque a soma ja paga nesse mes atinge a quota.
var regularizarMes = async function (req, res) {
  var t = await sequelize.transaction();
  try {
    var credito = await Credito.findByPk(req.params.id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!credito) {
      await t.rollback();
      return res.status(404).json({ error: "Credito nao encontrado" });
    }
    if (credito.estado === "Cancelado") {
      await t.rollback();
      return res.status(400).json({ error: "Este credito esta cancelado" });
    }
    if (credito.estado === "Pago") {
      await t.rollback();
      return res.status(400).json({ error: "Este credito ja esta totalmente pago" });
    }

    var mes = parseInt(req.body.mes);
    var ano = parseInt(req.body.ano);
    if (!mes || mes < 1 || mes > 12 || !ano) {
      await t.rollback();
      return res.status(400).json({ error: "Mes/ano invalidos" });
    }

    var movs = await CreditoMovimento.findAll({ where: { credito_id: credito.id }, transaction: t });
    var plano = construirPlano(credito, movs);
    var alvo = null;
    for (var i = 0; i < plano.length; i++) {
      if (plano[i].mes === mes && plano[i].ano === ano) { alvo = plano[i]; break; }
    }

    if (!alvo) {
      await t.rollback();
      return res.status(400).json({ error: "Esse mes nao faz parte do plano deste credito" });
    }
    if (alvo.estado === "Pago") {
      await t.rollback();
      return res.status(400).json({ error: "Esse mes ja esta totalmente pago" });
    }

    var emFalta = arredondar(toNum(alvo.previsto) - toNum(alvo.pago));
    if (emFalta <= 0) {
      await t.rollback();
      return res.status(400).json({ error: "Esse mes ja esta totalmente pago" });
    }

    var existente = await CreditoMovimento.findOne({
      where: { credito_id: credito.id, mes: mes, ano: ano },
      transaction: t,
    });

    if (existente) {
      await existente.update({ valor_descontado: toNum(alvo.previsto) }, { transaction: t });
    } else {
      await CreditoMovimento.create({
        credito_id: credito.id,
        colaborador_id: credito.colaborador_id,
        pagamento_id: null,
        mes: mes,
        ano: ano,
        valor_descontado: toNum(alvo.previsto),
      }, { transaction: t });
    }

    var novoPago = arredondar(toNum(credito.valor_pago) + emFalta);
    var valor = toNum(credito.valor);
    if (novoPago > valor) novoPago = valor;
    var novoEstado = novoPago >= valor - 0.005 ? "Pago" : "Ativo";
    await credito.update({ valor_pago: novoPago, estado: novoEstado }, { transaction: t });

    await t.commit();

    var actualizado = await Credito.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
        { model: CreditoMovimento, as: "movimentos", order: [["ano", "DESC"], ["mes", "DESC"]] },
      ],
    });
    var dados = actualizado.toJSON();
    dados.plano = construirPlano(actualizado, actualizado.movimentos || []);

    return res.status(200).json({ mensagem: "Mes regularizado manualmente", dados: dados });
  } catch (e) {
    await t.rollback();
    console.log("Erro ao regularizar mes do credito:", e.message);
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
  regularizarMes,
  calcularDescontosCreditos,
  registarDescontosCreditos,
};
