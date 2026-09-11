var { Op } = require("sequelize");
var { sequelize, Vencimento, Pagamento, Colaborador, RegistoPresenca } = require("../models");

// ==================== IMPOSTOS ANGOLA (IRT 2026 / INSS) ====================

var TAXA_SEGURANCA_SOCIAL = 0.03;
var ISENCAO_SUBSIDIO_ALIMENTACAO = 30000;
var TABELA_IRT = [
  { ate: 150000, parcela: 0, taxa: 0 },
  { ate: 200000, parcela: 12500, taxa: 0.16 },
  { ate: 300000, parcela: 31250, taxa: 0.18 },
  { ate: 500000, parcela: 49250, taxa: 0.19 },
  { ate: 1000000, parcela: 87250, taxa: 0.20 },
  { ate: 1500000, parcela: 187250, taxa: 0.21 },
  { ate: 2000000, parcela: 292250, taxa: 0.22 },
  { ate: 2500000, parcela: 402250, taxa: 0.23 },
  { ate: 5000000, parcela: 517250, taxa: 0.24 },
  { ate: 10000000, parcela: 1117250, taxa: 0.245 },
  { ate: Infinity, parcela: 2342250, taxa: 0.25 },
];

var arredondar = function (v) { return Math.round(v * 100) / 100; };

var calcularSegurancaSocial = function (bruto) {
  return arredondar(bruto * TAXA_SEGURANCA_SOCIAL);
};

var calcularIRT = function (base) {
  if (base <= 0) return 0;
  for (var i = 0; i < TABELA_IRT.length; i++) {
    if (base <= TABELA_IRT[i].ate) {
      var limiteInferior = i === 0 ? 0 : TABELA_IRT[i - 1].ate;
      return arredondar(TABELA_IRT[i].parcela + (base - limiteInferior) * TABELA_IRT[i].taxa);
    }
  }
  return 0;
};

var calcularDescontosObrigatorios = function (salarioBase, subsidios, horasExtras) {
  var sb = parseFloat(salarioBase) || 0;
  var sub = parseFloat(subsidios) || 0;
  var he = parseFloat(horasExtras) || 0;
  var bruto = sb + sub + he;
  var ss = calcularSegurancaSocial(bruto);
  var subsidiosTributaveis = Math.max(0, sub - ISENCAO_SUBSIDIO_ALIMENTACAO);
  var baseIRT = sb + he + subsidiosTributaveis - ss;
  if (baseIRT < 0) baseIRT = 0;
  return { seguranca_social: ss, irt: calcularIRT(baseIRT), bruto: bruto };
};

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

var formatarDataLocal = function (d) {
  var ano = d.getFullYear();
  var mes = String(d.getMonth() + 1).padStart(2, "0");
  var dia = String(d.getDate()).padStart(2, "0");
  return ano + "-" + mes + "-" + dia;
};

var calcularDescontoFaltas = async function (colaborador_id, mes, ano) {
  try {
    var dataInicio = new Date(ano, mes - 1, 1);
    var dataFim = new Date(ano, mes, 0);
    var strInicio = formatarDataLocal(dataInicio);
    var strFim = formatarDataLocal(dataFim);

    var faltas = await RegistoPresenca.findAll({
      where: {
        colaborador_id: colaborador_id,
        estado: { [Op.in]: ["Ausente", "Atrasado"] },
        justificado: false,
        data: { [Op.between]: [strInicio, strFim] },
      },
      attributes: ["id", "data", "estado", "hora_entrada"],
    });

    if (faltas.length === 0) return 0;

    var vencResult = await sequelize.query(
      "SELECT salario_base FROM contratos WHERE colaborador_id = ? AND estado = 'Activo' LIMIT 1",
      { replacements: [colaborador_id], type: sequelize.QueryTypes.SELECT }
    );

    if (!vencResult || vencResult.length === 0) {
      vencResult = await sequelize.query(
        "SELECT salario_base FROM contratos WHERE colaborador_id = ? ORDER BY createdAt DESC LIMIT 1",
        { replacements: [colaborador_id], type: sequelize.QueryTypes.SELECT }
      );
    }

    if (!vencResult || vencResult.length === 0) return 0;

    var salarioDiario = parseFloat(vencResult[0].salario_base) / 30;
    var salarioHora = salarioDiario / 8;
    var horasDescontar = 0;

    faltas.forEach(function (f) {
      if (f.estado === "Ausente") {
        horasDescontar += 8;
      } else if (f.estado === "Atrasado" && f.hora_entrada) {
        var partes = f.hora_entrada.split(":");
        var minsEntrada = parseInt(partes[0]) * 60 + parseInt(partes[1]);
        var minsNormais = 8 * 60;
        if (minsEntrada > minsNormais) {
          horasDescontar += Math.round(((minsEntrada - minsNormais) / 60) * 100) / 100;
        }
      }
    });

    return Math.round(horasDescontar * salarioHora * 100) / 100;
  } catch (e) {
    console.log("Erro ao calcular desconto de faltas:", e.message);
    return 0;
  }
};

var getContratoActual = async function (req, res) {
  try {
    var { colaborador_id } = req.params;
    console.log("DEBUG buscar contrato para:", colaborador_id);
    var contrato = await sequelize.query(
      "SELECT salario_base, subsidio_alimentacao FROM contratos WHERE colaborador_id = ? AND estado = 'Activo' ORDER BY createdAt DESC LIMIT 1",
      { replacements: [colaborador_id], type: sequelize.QueryTypes.SELECT }
    );
    console.log("DEBUG contrato activo:", JSON.stringify(contrato));
    if (!contrato || contrato.length === 0) {
      contrato = await sequelize.query(
        "SELECT salario_base, subsidio_alimentacao FROM contratos WHERE colaborador_id = ? ORDER BY createdAt DESC LIMIT 1",
        { replacements: [colaborador_id], type: sequelize.QueryTypes.SELECT }
      );
      console.log("DEBUG contrato fallback:", JSON.stringify(contrato));
    }
    if (!contrato || contrato.length === 0) {
      return res.status(404).json({ error: "Nenhum contrato encontrado para este colaborador" });
    }
    return res.status(200).json({ dados: contrato[0] });
  } catch (e) {
    console.log("Erro ao buscar contrato activo:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
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

    if (!dados.colaborador_id || !dados.mes || !dados.ano) {
      return res.status(400).json({ error: "colaborador_id, mes e ano sao obrigatorios" });
    }

    var existente = await Pagamento.findOne({
      where: { colaborador_id: dados.colaborador_id, mes: dados.mes, ano: dados.ano },
    });
    if (existente) {
      return res.status(409).json({ error: "Ja existe pagamento registado para este colaborador neste mes/ano" });
    }

    if (!dados.salario_base || dados.subsidios === undefined || dados.subsidios === "") {
      var contrato = await sequelize.query(
        "SELECT salario_base, subsidio_alimentacao FROM contratos WHERE colaborador_id = ? AND estado = 'Activo' ORDER BY createdAt DESC LIMIT 1",
        { replacements: [dados.colaborador_id], type: sequelize.QueryTypes.SELECT }
      );
      if (!contrato || contrato.length === 0) {
        contrato = await sequelize.query(
          "SELECT salario_base, subsidio_alimentacao FROM contratos WHERE colaborador_id = ? ORDER BY createdAt DESC LIMIT 1",
          { replacements: [dados.colaborador_id], type: sequelize.QueryTypes.SELECT }
        );
      }
      if (contrato && contrato.length > 0) {
        if (!dados.salario_base) dados.salario_base = contrato[0].salario_base;
        if (dados.subsidios === undefined || dados.subsidios === "") dados.subsidios = contrato[0].subsidio_alimentacao || 0;
      } else if (!dados.salario_base) {
        return res.status(400).json({ error: "Colaborador nao possui contrato activo com salario definido" });
      }
    }

    var toNum = function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; };
    dados.salario_base = toNum(dados.salario_base);
    dados.subsidios = toNum(dados.subsidios);
    dados.horas_extras = toNum(dados.horas_extras);
    dados.descontos = toNum(dados.descontos);

    var obrigatorios = calcularDescontosObrigatorios(dados.salario_base, dados.subsidios, dados.horas_extras);
    dados.seguranca_social = obrigatorios.seguranca_social;
    dados.irt = obrigatorios.irt;

    var descontoFaltas = await calcularDescontoFaltas(dados.colaborador_id, parseInt(dados.mes), parseInt(dados.ano));
    dados.desconto_faltas = descontoFaltas;

    dados.total_liquido = Math.round((dados.salario_base + dados.subsidios + dados.horas_extras - dados.descontos - dados.irt - dados.seguranca_social - descontoFaltas) * 100) / 100;

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

    var toNum = function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; };

    var sb = toNum(dadosActualizar.salario_base !== undefined ? dadosActualizar.salario_base : pagamento.salario_base);
    var sub = toNum(dadosActualizar.subsidios !== undefined ? dadosActualizar.subsidios : pagamento.subsidios);
    var he = toNum(dadosActualizar.horas_extras !== undefined ? dadosActualizar.horas_extras : pagamento.horas_extras);
    var desc = toNum(dadosActualizar.descontos !== undefined ? dadosActualizar.descontos : pagamento.descontos);

    var obrigatorios = calcularDescontosObrigatorios(sb, sub, he);
    dadosActualizar.seguranca_social = obrigatorios.seguranca_social;
    dadosActualizar.irt = obrigatorios.irt;

    var colId = pagamento.colaborador_id;
    var mesAtual = dadosActualizar.mes !== undefined ? parseInt(dadosActualizar.mes) : pagamento.mes;
    var anoAtual = dadosActualizar.ano !== undefined ? parseInt(dadosActualizar.ano) : pagamento.ano;
    var descontoFaltas = await calcularDescontoFaltas(colId, mesAtual, anoAtual);
    dadosActualizar.desconto_faltas = descontoFaltas;

    dadosActualizar.total_liquido = Math.round((sb + sub + he - desc - obrigatorios.irt - obrigatorios.seguranca_social - descontoFaltas) * 100) / 100;

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
    console.log("Erro ao actualizar pagamento:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var recalcularFaltas = async function (req, res) {
  try {
    var pagamento = await Pagamento.findByPk(req.params.id);
    if (!pagamento) {
      return res.status(404).json({ error: "Pagamento nao encontrado" });
    }

    var descontoFaltas = await calcularDescontoFaltas(pagamento.colaborador_id, pagamento.mes, pagamento.ano);

    var sb = parseFloat(pagamento.salario_base) || 0;
    var sub = parseFloat(pagamento.subsidios) || 0;
    var he = parseFloat(pagamento.horas_extras) || 0;
    var desc = parseFloat(pagamento.descontos) || 0;
    var irt = parseFloat(pagamento.irt) || 0;
    var ss = parseFloat(pagamento.seguranca_social) || 0;
    var totalLiquido = Math.round((sb + sub + he - desc - irt - ss - descontoFaltas) * 100) / 100;

    await pagamento.update({
      desconto_faltas: descontoFaltas,
      total_liquido: totalLiquido,
    });

    var actualizado = await Pagamento.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Desconto de faltas recalculado com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    console.log("Erro ao recalcular faltas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var removePagamento = async function (req, res) {
  try {
    var pagamento = await Pagamento.findByPk(req.params.id);
    if (!pagamento) {
      return res.status(404).json({ error: "Pagamento nao encontrado" });
    }
    await pagamento.destroy();
    return res.status(200).json({ mensagem: "Pagamento eliminado com sucesso" });
  } catch (e) {
    console.log("Erro ao eliminar pagamento:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getSalarioContrato = async function (colaborador_id) {
  try {
    var contrato = await sequelize.query(
      "SELECT salario_base, subsidio_alimentacao FROM contratos WHERE colaborador_id = ? AND estado = 'Activo' ORDER BY createdAt DESC LIMIT 1",
      { replacements: [colaborador_id], type: sequelize.QueryTypes.SELECT }
    );
    if (!contrato || contrato.length === 0) {
      contrato = await sequelize.query(
        "SELECT salario_base, subsidio_alimentacao FROM contratos WHERE colaborador_id = ? ORDER BY createdAt DESC LIMIT 1",
        { replacements: [colaborador_id], type: sequelize.QueryTypes.SELECT }
      );
    }
    if (!contrato || contrato.length === 0) return null;
    return contrato[0];
  } catch (e) {
    console.log("Erro ao buscar salario do contrato:", e.message);
    return null;
  }
};

// ==================== GERAR PAGAMENTOS AUTOMATICOS ====================

var gerarPagamentosAutomaticos = async function (req, res) {
  var t = await sequelize.transaction();
  try {
    var { mes, ano } = req.body;
    if (!mes || !ano) {
      return res.status(400).json({ error: "mes e ano sao obrigatorios" });
    }

    // Colaboradores ativos
    var colaboradores = await Colaborador.findAll({
      where: { estado: "Activo" },
      attributes: ["id", "nome_completo", "numero_colaborador"],
    });

    if (colaboradores.length === 0) {
      return res.status(400).json({ error: "Nenhum colaborador ativo encontrado" });
    }

    var toNum = function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; };

    var criados = [];
    var ignorados = [];
    var erros = [];

    for (var i = 0; i < colaboradores.length; i++) {
      var colab = colaboradores[i];

      // Verificacao de pagamento existente
      var existente = await Pagamento.findOne({
        where: { colaborador_id: colab.id, mes: mes, ano: ano },
        transaction: t,
      });
      if (existente) {
        ignorados.push({ colaborador_id: colab.id, motivo: "Ja existe pagamento" });
        continue;
      }

      var contrato = await getSalarioContrato(colab.id);
      if (!contrato || !contrato.salario_base) {
        erros.push({ colaborador_id: colab.id, motivo: "Sem contrato ativo com salario" });
        continue;
      }

      var salarioBase = toNum(contrato.salario_base);
      var subsidios = toNum(contrato.subsidio_alimentacao);

      var obrigatorios = calcularDescontosObrigatorios(salarioBase, subsidios, 0);
      var descontoFaltas = await calcularDescontoFaltas(colab.id, parseInt(mes), parseInt(ano));
      var totalLiquido = Math.round((salarioBase + subsidios - obrigatorios.irt - obrigatorios.seguranca_social - descontoFaltas) * 100) / 100;

      var pagamentoDados = {
        colaborador_id: colab.id,
        mes: parseInt(mes),
        ano: parseInt(ano),
        salario_base: salarioBase,
        subsidios: subsidios,
        horas_extras: 0,
        descontos: 0,
        irt: obrigatorios.irt,
        seguranca_social: obrigatorios.seguranca_social,
        desconto_faltas: descontoFaltas,
        total_liquido: totalLiquido,
        estado: "Pendente",
      };

      try {
        var pagamento = await Pagamento.create(pagamentoDados, { transaction: t });
        criados.push({ colaborador_id: colab.id, total_liquido: totalLiquido, id: pagamento.id });
      } catch (erroInterno) {
        if (erroInterno.name === "SequelizeUniqueConstraintError") {
          ignorados.push({ colaborador_id: colab.id, motivo: "Ja existe pagamento" });
        } else {
          erros.push({ colaborador_id: colab.id, motivo: erroInterno.message });
        }
      }
    }

    await t.commit();

    return res.status(200).json({
      mensagem: "Pagamentos processados com sucesso",
      dados: {
        total_colaboradores: colaboradores.length,
        criados: criados.length,
        ignorados: ignorados.length,
        erros: erros.length,
        pagamentos_criados: criados,
        ignorados_detalhe: ignorados,
        erros_detalhe: erros,
      },
    });
  } catch (e) {
    await t.rollback();
    console.log("Erro ao gerar pagamentos automaticos:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== RESUMO PDF (dados) ====================

var listarPagamentosParaResumo = async function (mes, ano) {
  var where = { mes: mes, ano: ano };
  var include = [
    { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "organizacao_id"] },
  ];
  try {
    var pagamentos = await Pagamento.findAll({
      where: where,
      include: include,
      order: [["createdAt", "ASC"]],
    });
    return pagamentos;
  } catch (e) {
    console.log("Erro ao listar pagamentos para resumo:", e.message);
    return [];
  }
};

var previewDescontoFaltas = async function (req, res) {
  try {
    var { colaborador_id, mes, ano } = req.query;
    if (!colaborador_id || !mes || !ano) {
      return res.status(400).json({ error: "colaborador_id, mes e ano sao obrigatorios" });
    }
    var desconto = await calcularDescontoFaltas(colaborador_id, parseInt(mes), parseInt(ano));
    return res.status(200).json({ dados: { desconto_faltas: desconto } });
  } catch (e) {
    console.log("Erro ao preview desconto faltas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { listVencimentos, getVencimento, createVencimento, updateVencimento, removeVencimentos, listPagamentos, createPagamento, updatePagamento, removePagamento, recalcularFaltas, gerarPagamentosAutomaticos, listarPagamentosParaResumo, getContratoActual, previewDescontoFaltas };
