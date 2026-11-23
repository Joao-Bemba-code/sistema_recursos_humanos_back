var { Op } = require("sequelize");
var { sequelize, BancoHoraMovimento, EscalaSemanal, PedidoColaborador } = require("../models");

// ===========================================================================
// BANCO DE HORAS
// Regra: saida antes da hora prevista (segundo escalas_semanais, fallback
// 08:00-16:00) cria uma divida. Pedido de dispensa aprovado justifica
// automaticamente. Horas feitas a mais noutro dia compensam automaticamente.
// O que ficar pendente e descontado no fecho do mes a salario_base/30/8.
// ===========================================================================

var arredondar = function (v) {
  var n = Number(v);
  if (isNaN(n)) return 0;
  var ajuste = n >= 0 ? Number.EPSILON : -Number.EPSILON;
  return Math.round((n + ajuste) * 100) / 100;
};

var formatarDataLocal = function (d) {
  if (!d) return null;
  var texto = String(d).substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  var data = new Date(d);
  if (isNaN(data.getTime())) return null;
  return data.getFullYear() + "-" +
    String(data.getMonth() + 1).padStart(2, "0") + "-" +
    String(data.getDate()).padStart(2, "0");
};

var paraMinutos = function (hora) {
  if (!hora) return null;
  var partes = String(hora).split(":");
  var h = parseInt(partes[0], 10);
  var m = parseInt(partes[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

var duracaoHoras = function (entrada, saida) {
  var e = paraMinutos(entrada);
  var s = paraMinutos(saida);
  if (e === null || s === null) return null;
  var diff = s - e;
  if (diff < 0) diff += 24 * 60;
  return arredondar(diff / 60);
};

// Horario previsto do dia, vindo da escala semanal do colaborador.
var obterHorarioPrevisto = async function (colaborador_id, data) {
  var texto = formatarDataLocal(data);
  var diaSemana = new Date((texto || "1970-01-01") + "T00:00:00").getDay();
  var escala = null;
  try {
    escala = await EscalaSemanal.findOne({
      where: { colaborador_id: colaborador_id, dia_semana: diaSemana },
    });
  } catch (e) {
    escala = null;
  }
  var entrada = escala && escala.hora_entrada ? String(escala.hora_entrada).slice(0, 5) : "08:00";
  var saida = escala && escala.hora_saida ? String(escala.hora_saida).slice(0, 5) : "16:00";
  var horas = duracaoHoras(entrada, saida);
  if (horas === null || horas <= 0) {
    entrada = "08:00";
    saida = "16:00";
    horas = 8;
  }
  return { entrada: entrada, saida: saida, horas: horas, origem: escala ? "escala" : "padrao" };
};

var salarioHora = async function (colaborador_id) {
  var contrato = await sequelize.query(
    "SELECT salario_base FROM contratos WHERE colaborador_id = ? AND estado = 'Activo' LIMIT 1",
    { replacements: [colaborador_id], type: sequelize.QueryTypes.SELECT }
  );
  if (!contrato || contrato.length === 0) {
    contrato = await sequelize.query(
      "SELECT salario_base FROM contratos WHERE colaborador_id = ? ORDER BY createdAt DESC LIMIT 1",
      { replacements: [colaborador_id], type: sequelize.QueryTypes.SELECT }
    );
  }
  var base = contrato && contrato.length > 0 ? parseFloat(contrato[0].salario_base) : 0;
  if (isNaN(base) || base <= 0) return 0;
  return base / 30 / 8;
};

var liquidoMovimento = function (movimento) {
  var horas = Number(movimento.horas) || 0;
  var compensadas = Number(movimento.horas_compensadas) || 0;
  if (horas < 0) return arredondar(Math.min(0, horas + compensadas));
  return arredondar(Math.max(0, horas - compensadas));
};

// Recalcula de forma deterministica quanto do saldo positivo abate cada divida
// (ordem cronologica). Nao apaga movimentos: apenas actualiza as compensacoes.
var recalcularCompensacoes = async function (colaborador_id) {
  var movimentos = await BancoHoraMovimento.findAll({
    where: { colaborador_id: colaborador_id, estado: "aberto" },
    order: [["data", "ASC"], ["createdAt", "ASC"], ["id", "ASC"]],
  });
  if (movimentos.length === 0) return;

  movimentos.forEach(function (m) {
    m.horas_compensadas = 0;
  });

  var creditos = movimentos.filter(function (m) { return Number(m.horas) > 0; });
  var debitos = movimentos.filter(function (m) { return Number(m.horas) < 0; });

  creditos.forEach(function (credito) {
    var restante = Number(credito.horas) || 0;
    debitos.forEach(function (debito) {
      if (restante <= 0) return;
      var pendente = -(Number(debito.horas) || 0) - (Number(debito.horas_compensadas) || 0);
      if (pendente <= 0) return;
      var usar = Math.min(restante, pendente);
      debito.horas_compensadas = arredondar((Number(debito.horas_compensadas) || 0) + usar);
      credito.horas_compensadas = arredondar((Number(credito.horas_compensadas) || 0) + usar);
      restante = arredondar(restante - usar);
    });
  });

  for (var i = 0; i < movimentos.length; i++) {
    await movimentos[i].update({ horas_compensadas: movimentos[i].horas_compensadas });
  }
};

// Dispensa ja aprovada que cubra a data indicada. Usada quando o registo de
// presenca aparece DEPOIS da aprovacao (ex.: sync do biometro mais tardia):
// a divida ja nasce justificada, sem precisar de outro pedido.
var dispensaAprovadaParaData = async function (colaborador_id, data) {
  if (!colaborador_id || !data) return null;
  var pedidos = await PedidoColaborador.findAll({
    where: { colaborador_id: colaborador_id, tipo: "dispensa", estado: "aprovado" },
    attributes: ["id", "dados", "responded_by"],
    order: [["updatedAt", "DESC"]],
  });
  for (var i = 0; i < pedidos.length; i++) {
    var dados = pedidos[i].dados || {};
    if (typeof dados === "string") {
      try { dados = JSON.parse(dados); } catch (e) { dados = {}; }
    }
    var inicio = formatarDataLocal(dados.data_inicio || dados.data);
    var fim = formatarDataLocal(dados.data_fim || inicio);
    if (!inicio) continue;
    if (!fim || fim < inicio) fim = inicio;
    if (data >= inicio && data <= fim) return pedidos[i];
  }
  return null;
};

// Cria/atualiza os movimentos resultantes de um registo de presenca.
// Movimentos ja justificados ou descontados nunca sao alterados.
var sincronizarPresenca = async function (registo) {
  if (!registo || !registo.id || !registo.colaborador_id) return null;
  var colaborador_id = registo.colaborador_id;
  var data = formatarDataLocal(registo.data);
  if (!data) return null;

  var existentes = await BancoHoraMovimento.findAll({
    where: { registo_presenca_id: registo.id },
  });
  var deficit = existentes.find(function (m) { return m.tipo === "deficit_saida_antecipada"; });
  var compensacao = existentes.find(function (m) { return m.tipo === "compensacao"; });

  var semBanco = ["Ausente", "Licenca", "Ferias", "Fim_semana"];
  var horasTrabalhadas = Number(registo.horas_trabalhadas);
  var mediuHoras = isFinite(horasTrabalhadas) && horasTrabalhadas > 0;

  var horasDeficit = 0;
  var horasCredito = 0;

  if (!semBanco.includes(registo.estado) && mediuHoras) {
    var previsto = await obterHorarioPrevisto(colaborador_id, data);
    var entradaPrevista = paraMinutos(previsto.entrada);
    var saidaPrevista = paraMinutos(previsto.saida);
    var saidaReal = paraMinutos(registo.hora_saida);

    if (saidaReal !== null && entradaPrevista !== null && saidaPrevista !== null) {
      var antecipacao = saidaReal - saidaPrevista;
      // Turno que passa da meia-noite (ex.: 20:00-04:00): saida 02:00 e' antes
      // da saida prevista 04:00.
      if (antecipacao < -12 * 60) antecipacao += 24 * 60;
      if (antecipacao < 0) {
        horasDeficit = arredondar(Math.min(-antecipacao / 60, horasTrabalhadas));
        if (horasDeficit < 0.01) horasDeficit = 0;
      }
    }

    var excedente = arredondar(horasTrabalhadas - previsto.horas);
    if (excedente >= 0.01 && !horasDeficit) horasCredito = excedente;
  }

  var alterou = false;

  if (horasDeficit > 0) {
    if (!deficit) {
      var dispensa = await dispensaAprovadaParaData(colaborador_id, data);
      await BancoHoraMovimento.create({
        colaborador_id: colaborador_id,
        registo_presenca_id: registo.id,
        tipo: "deficit_saida_antecipada",
        data: data,
        horas: -horasDeficit,
        estado: dispensa ? "justificado" : "aberto",
        pedido_id: dispensa ? dispensa.id : null,
        justificado_por: dispensa ? dispensa.responded_by || null : null,
        justificado_em: dispensa ? new Date() : null,
        observacoes: dispensa
          ? "Dispensa aprovada (pedido " + String(dispensa.id).substring(0, 8) + ")"
          : "Saida as " + (registo.hora_saida || "--:--") + " (previsto " +
            (await obterHorarioPrevisto(colaborador_id, data)).saida + ")",
      });
      alterou = true;
    } else if (deficit.estado === "aberto" && Number(deficit.horas) !== -horasDeficit) {
      await deficit.update({ horas: -horasDeficit });
      alterou = true;
    }
  } else if (deficit && deficit.estado === "aberto") {
    await deficit.destroy();
    alterou = true;
  }

  if (horasCredito > 0) {
    if (!compensacao) {
      await BancoHoraMovimento.create({
        colaborador_id: colaborador_id,
        registo_presenca_id: registo.id,
        tipo: "compensacao",
        data: data,
        horas: horasCredito,
        estado: "aberto",
        observacoes: "Horas trabalhadas a mais (" + horasCredito + "h)",
      });
      alterou = true;
    } else if (compensacao.estado === "aberto" && Number(compensacao.horas) !== horasCredito) {
      await compensacao.update({ horas: horasCredito });
      alterou = true;
    }
  } else if (compensacao && compensacao.estado === "aberto") {
    await compensacao.destroy();
    alterou = true;
  }

  if (alterou) await recalcularCompensacoes(colaborador_id);
  return alterou;
};

var removerMovimentosDoRegisto = async function (registoId, colaborador_id) {
  var movimentos = await BancoHoraMovimento.findAll({ where: { registo_presenca_id: registoId } });
  var abertos = movimentos.filter(function (m) { return m.estado === "aberto"; });
  for (var i = 0; i < abertos.length; i++) {
    await abertos[i].destroy();
  }
  if (abertos.length > 0 && colaborador_id) await recalcularCompensacoes(colaborador_id);
  return abertos.length;
};

// Aprovacao de dispensa: todas as dividas do periodo ficam justificadas.
var justificarDispensa = async function (pedido) {
  if (!pedido || !pedido.colaborador_id) return 0;
  var dados = pedido.dados || {};
  if (typeof dados === "string") {
    try { dados = JSON.parse(dados); } catch (e) { dados = {}; }
  }
  var inicio = formatarDataLocal(dados.data_inicio || dados.data);
  var fim = formatarDataLocal(dados.data_fim || inicio);
  if (!inicio) return 0;
  if (!fim || fim < inicio) fim = inicio;

  var movimentos = await BancoHoraMovimento.findAll({
    where: {
      colaborador_id: pedido.colaborador_id,
      estado: "aberto",
      horas: { [Op.lt]: 0 },
      data: { [Op.between]: [inicio, fim] },
    },
  });
  for (var i = 0; i < movimentos.length; i++) {
    await movimentos[i].update({
      estado: "justificado",
      pedido_id: pedido.id,
      justificado_por: pedido.responded_by || null,
      justificado_em: new Date(),
      observacoes: "Dispensa aprovada (pedido " + String(pedido.id).substring(0, 8) + ")",
    });
  }
  if (movimentos.length > 0) await recalcularCompensacoes(pedido.colaborador_id);
  return movimentos.length;
};

var justificarMovimento = async function (movimento, utilizador_id, observacoes) {
  if (!movimento || movimento.estado !== "aberto") return null;
  await movimento.update({
    estado: "justificado",
    justificado_por: utilizador_id || null,
    justificado_em: new Date(),
    observacoes: observacoes || "Justificado manualmente pelo administrador",
  });
  await recalcularCompensacoes(movimento.colaborador_id);
  return movimento;
};

var calcularSaldo = async function (colaborador_id) {
  var movimentos = await BancoHoraMovimento.findAll({
    where: { colaborador_id: colaborador_id, estado: "aberto" },
    order: [["data", "ASC"], ["id", "ASC"]],
  });
  var devidas = 0;
  var credito = 0;
  movimentos.forEach(function (m) {
    var liquido = liquidoMovimento(m);
    if (liquido < 0) devidas += -liquido;
    else credito += liquido;
  });
  return {
    saldo: arredondar(credito - devidas),
    horas_devidas: arredondar(devidas),
    horas_credito: arredondar(credito),
    movimentos: movimentos,
  };
};

var calcularDesconto = async function (colaborador_id, mes, ano, apenasMes, pagamentoId, salarioBase) {
  var resultado = { total: 0, horas: 0, valor_hora: 0, movimentos: [] };
  // Quando vem da folha, usa exatamente o salario_base daquele pagamento.
  // Nos outros casos (portal/preview) cai para o contrato activo.
  var baseInformada = parseFloat(salarioBase);
  var valorHora = isFinite(baseInformada) && baseInformada > 0
    ? baseInformada / 30 / 8
    : await salarioHora(colaborador_id);
  resultado.valor_hora = arredondar(valorHora);
  if (valorHora <= 0) return resultado;

  var where = { colaborador_id: colaborador_id, horas: { [Op.lt]: 0 } };
  if (pagamentoId) {
    // Ao recalcular um pagamento ja gravado, volta a incluir as dividas que
    // foram descontadas nesse mesmo pagamento (comportamento igual ao das faltas).
    where[Op.or] = [
      { estado: "aberto" },
      { estado: "descontado", pagamento_id: pagamentoId },
    ];
  } else {
    where.estado = "aberto";
  }
  if (apenasMes) {
    var inicio = ano + "-" + String(mes).padStart(2, "0") + "-01";
    var fim = new Date(ano, mes, 0);
    where.data = {
      [Op.between]: [inicio, formatarDataLocal(fim)],
    };
  }
  var movimentos = await BancoHoraMovimento.findAll({ where: where });
  var elegiveis = movimentos.filter(function (m) { return liquidoMovimento(m) < 0; });
  var horas = 0;
  elegiveis.forEach(function (m) { horas += -liquidoMovimento(m); });
  resultado.horas = arredondar(horas);
  resultado.total = arredondar(horas * valorHora);
  resultado.movimentos = elegiveis.map(function (m) { return m.id; });
  return resultado;
};

var marcarDescontado = async function (colaborador_id, mes, ano, pagamento_id, apenasMes, transaction, salarioBase) {
  var calculo = await calcularDesconto(colaborador_id, mes, ano, apenasMes, pagamento_id, salarioBase);
  if (calculo.movimentos.length === 0) return calculo;

  var movimentos = await BancoHoraMovimento.findAll({
    where: { id: { [Op.in]: calculo.movimentos } },
  });
  for (var i = 0; i < movimentos.length; i++) {
    var liquido = liquidoMovimento(movimentos[i]);
    await movimentos[i].update({
      estado: "descontado",
      pagamento_id: pagamento_id || null,
      processada_mes: mes,
      processada_ano: ano,
      valor_descontado: arredondar(-liquido * calculo.valor_hora),
    }, transaction ? { transaction: transaction } : undefined);
  }
  return calculo;
};

module.exports = {
  arredondar,
  formatarDataLocal,
  paraMinutos,
  duracaoHoras,
  obterHorarioPrevisto,
  liquidoMovimento,
  recalcularCompensacoes,
  sincronizarPresenca,
  removerMovimentosDoRegisto,
  justificarDispensa,
  justificarMovimento,
  calcularSaldo,
  calcularDesconto,
  marcarDescontado,
  salarioHora,
};
