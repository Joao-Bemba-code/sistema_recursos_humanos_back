var { Op } = require("sequelize");
var { Colaborador, Utilizador, ConvocatoriaDisciplinar, MedidaDisciplinar } = require("../models");
var notificacaoController = require("./notificacaoController");

// Valores internos (sem acentos) e respectivas etiquetas usadas no ecra.
var ESTADOS_CONVOCATORIA = ["Emitida", "Entregue", "Realizada", "Cancelada"];
var SITUACOES_MEDIDA = ["Em_analise", "Decidida", "Notificada", "Cumprida", "Arquivada", "Recorrida"];
var MEDIDAS = ["Advertencia_verbal", "Advertencia_escrita", "Suspensao", "Despedimento", "Multa", "Outra"];

var erro = function (status, mensagem) {
  var e = new Error(mensagem);
  e.status = status;
  return e;
};

var responderErro = function (res, e, contexto) {
  var status = e.status || 500;
  if (status >= 500) console.log("Erro " + (contexto || "processos disciplinares") + ":", e.message);
  return res.status(status).json({ error: status >= 500 ? "Erro interno do servidor" : e.message });
};

var texto = function (valor, limite) {
  if (valor === undefined || valor === null) return null;
  var s = String(valor).trim();
  if (!s) return null;
  return limite ? s.slice(0, limite) : s;
};

var hojeISO = function () {
  return new Date().toISOString().slice(0, 10);
};

var dataValida = function (valor) {
  if (valor === undefined || valor === null || valor === "") return null;
  var s = String(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw erro(400, "Data inválida");
  return s;
};

var horaValida = function (valor) {
  var s = texto(valor, 5);
  if (!s) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw erro(400, "Hora inválida. Use HH:MM");
  return s;
};

var obterColaborador = async function (req, id) {
  var colaborador = await Colaborador.findByPk(id);
  if (!colaborador) throw erro(404, "Colaborador não encontrado");
  if (colaborador.organizacao_id && req.organizacao_id && String(colaborador.organizacao_id) !== String(req.organizacao_id)) {
    throw erro(404, "Colaborador não encontrado");
  }
  return colaborador;
};

var scopedWhere = function (req, extra) {
  var where = Object.assign({}, extra || {});
  if (req.organizacao_id) where.organizacao_id = req.organizacao_id;
  return where;
};

var gerarNumeroProcesso = async function (req) {
  var ano = new Date().getFullYear();
  var totalConv = await ConvocatoriaDisciplinar.count({ where: scopedWhere(req) });
  var totalMed = await MedidaDisciplinar.count({ where: scopedWhere(req) });
  var base = totalConv + totalMed + 1;
  for (var i = 0; i < 50; i++) {
    var numero = "PD-" + ano + "-" + String(base + i).padStart(4, "0");
    var existeConv = await ConvocatoriaDisciplinar.count({ where: scopedWhere(req, { numero_processo: numero }) });
    var existeMed = await MedidaDisciplinar.count({ where: scopedWhere(req, { numero_processo: numero }) });
    if (existeConv === 0 && existeMed === 0) return numero;
  }
  return "PD-" + ano + "-" + Date.now().toString().slice(-6);
};

var nomesUtilizadores = async function (ids) {
  var unicos = [];
  (ids || []).forEach(function (id) {
    if (id && unicos.indexOf(String(id)) === -1) unicos.push(String(id));
  });
  if (unicos.length === 0) return {};
  var utilizadores = await Utilizador.findAll({
    where: { id: unicos },
    attributes: ["id", "nome_completo", "username", "email"],
  });
  var mapa = {};
  utilizadores.forEach(function (u) {
    mapa[u.id] = u.nome_completo || u.username || u.email || "Utilizador";
  });
  return mapa;
};

var notificarColaborador = async function (colaborador, titulo, mensagem, link) {
  if (!colaborador || !colaborador.utilizador_id) return;
  try {
    await notificacaoController.create({
      organizacao_id: colaborador.organizacao_id,
      utilizador_id: colaborador.utilizador_id,
      titulo: titulo,
      mensagem: mensagem,
      tipo: "warning",
      link: link || "/dashboard/portal",
      modulo: "processos_disciplinares",
    });
  } catch (e) {
    console.log("Aviso: notificacao disciplinar nao criada:", e.message);
  }
};

// ---------- Convocatórias ----------

var normalizarConvocatoria = function (body, criar) {
  var out = {};
  var camposTexto = ["numero_processo", "colaborador_id", "factos_imputados", "hora_entrevista", "local", "direitos_trabalhador", "comprovativo_url", "comprovativo_nome", "observacoes_entrevista"];
  camposTexto.forEach(function (campo) {
    if (body[campo] !== undefined) out[campo] = texto(body[campo], campo === "numero_processo" ? 40 : (campo === "hora_entrevista" ? 5 : (campo === "comprovativo_url" ? 500 : (campo === "local" ? 200 : (campo === "colaborador_id" ? 36 : null)))));
  });
  if (body.data_entrevista !== undefined) out.data_entrevista = dataValida(body.data_entrevista);
  if (body.data_emissao !== undefined) out.data_emissao = dataValida(body.data_emissao);
  if (body.data_entrega !== undefined) out.data_entrega = dataValida(body.data_entrega);
  if (body.hora_entrevista !== undefined) out.hora_entrevista = horaValida(body.hora_entrevista);
  if (body.estado !== undefined) {
    var estado = texto(body.estado, 30);
    if (estado && ESTADOS_CONVOCATORIA.indexOf(estado) === -1) throw erro(400, "Estado da convocatória inválido");
    out.estado = estado;
  }
  if (criar) {
    out.data_emissao = out.data_emissao || hojeISO();
    out.estado = out.estado || "Emitida";
  }
  return out;
};

var validarConvocatoria = function (dados) {
  if (!dados.numero_processo) throw erro(400, "Indique o número do processo");
  if (!dados.colaborador_id) throw erro(400, "Selecione o trabalhador");
  if (!dados.factos_imputados) throw erro(400, "Descreva os factos imputados");
  if (!dados.data_entrevista) throw erro(400, "Indique a data da entrevista");
};

var serializarConvocatorias = async function (rows) {
  var ids = [];
  rows.forEach(function (r) {
    if (r.emitido_por) ids.push(r.emitido_por);
    if (r.entregue_por) ids.push(r.entregue_por);
  });
  var nomes = await nomesUtilizadores(ids);
  return rows.map(function (r) {
    var o = r.toJSON();
    o.emitido_por_nome = r.emitido_por ? (nomes[r.emitido_por] || "Utilizador") : null;
    o.entregue_por_nome = r.entregue_por ? (nomes[r.entregue_por] || "Utilizador") : null;
    return o;
  });
};

var listConvocatorias = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = Math.min(parseInt(req.query.limit) || 15, 200);
    var offset = (page - 1) * limit;
    var search = texto(req.query.search, 100);
    var estado = texto(req.query.estado, 30);
    var colaborador_id = texto(req.query.colaborador_id, 36);

    var where = scopedWhere(req);
    if (estado) where.estado = estado;
    if (colaborador_id) where.colaborador_id = colaborador_id;
    if (search) {
      where[Op.or] = [
        { numero_processo: { [Op.like]: "%" + search + "%" } },
        { factos_imputados: { [Op.like]: "%" + search + "%" } },
        { local: { [Op.like]: "%" + search + "%" } },
      ];
    }

    var { count, rows } = await ConvocatoriaDisciplinar.findAndCountAll({
      where: where,
      include: [{ model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"], required: false }],
      order: [["data_entrevista", "DESC"], ["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

    return res.status(200).json({
      dados: await serializarConvocatorias(rows),
      paginacao: { total: count, pagina: page, limite: limit, total_paginas: Math.ceil(count / limit) || 1 },
      estados: ESTADOS_CONVOCATORIA,
    });
  } catch (e) {
    return responderErro(res, e, "listar convocatórias");
  }
};

var getConvocatoria = async function (req, res) {
  try {
    var conv = await ConvocatoriaDisciplinar.findOne({
      where: scopedWhere(req, { id: req.params.id }),
      include: [{ model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "email_pessoal", "telefone"], required: false }],
    });
    if (!conv) throw erro(404, "Convocatória não encontrada");
    var dados = (await serializarConvocatorias([conv]))[0];
    return res.status(200).json({ dados: dados });
  } catch (e) {
    return responderErro(res, e, "ver convocatória");
  }
};

var createConvocatoria = async function (req, res) {
  try {
    var dados = normalizarConvocatoria(req.body, true);
    if (!dados.numero_processo) dados.numero_processo = await gerarNumeroProcesso(req);
    validarConvocatoria(dados);
    var colaborador = await obterColaborador(req, dados.colaborador_id);
    dados.organizacao_id = req.organizacao_id || colaborador.organizacao_id || null;
    dados.emitido_por = req.utilizador ? req.utilizador.id : null;

    var conv = await ConvocatoriaDisciplinar.create(dados);
    var completa = await ConvocatoriaDisciplinar.findByPk(conv.id, {
      include: [{ model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"], required: false }],
    });

    await notificarColaborador(
      colaborador,
      "Convocatória para entrevista disciplinar",
      "Foi emitida uma convocatória no âmbito do processo " + conv.numero_processo + ". Entrevista em " + String(conv.data_entrevista).slice(0, 10) + (conv.hora_entrevista ? " às " + conv.hora_entrevista : "") + (conv.local ? " — " + conv.local : "") + ". Consulte os direitos e deveres no documento.",
      "/dashboard/portal"
    );

    return res.status(201).json({ mensagem: "Convocatória emitida com sucesso", dados: (await serializarConvocatorias([completa]))[0] });
  } catch (e) {
    return responderErro(res, e, "criar convocatória");
  }
};

var updateConvocatoria = async function (req, res) {
  try {
    var conv = await ConvocatoriaDisciplinar.findOne({ where: scopedWhere(req, { id: req.params.id }) });
    if (!conv) throw erro(404, "Convocatória não encontrada");

    var dados = normalizarConvocatoria(req.body, false);
    if (dados.colaborador_id) {
      var colaborador = await obterColaborador(req, dados.colaborador_id);
      conv.colaborador_id = colaborador.id;
      delete dados.colaborador_id;
    }
    if (dados.estado === "Entregue") {
      if (!dados.data_entrega && !conv.data_entrega) dados.data_entrega = hojeISO();
      if (conv.estado !== "Entregue") dados.entregue_por = req.utilizador ? req.utilizador.id : null;
    }
    // Não apagar campos obrigatórios com valores vazios
    if (dados.numero_processo === null) delete dados.numero_processo;
    if (dados.estado === null) delete dados.estado;
    if (dados.factos_imputados === null) delete dados.factos_imputados;
    if (dados.data_entrevista === null) delete dados.data_entrevista;

    await conv.update(dados);
    var completa = await ConvocatoriaDisciplinar.findByPk(conv.id, {
      include: [{ model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"], required: false }],
    });
    return res.status(200).json({ mensagem: "Convocatória actualizada com sucesso", dados: (await serializarConvocatorias([completa]))[0] });
  } catch (e) {
    return responderErro(res, e, "actualizar convocatória");
  }
};

var removeConvocatoria = async function (req, res) {
  try {
    var conv = await ConvocatoriaDisciplinar.findOne({ where: scopedWhere(req, { id: req.params.id }) });
    if (!conv) throw erro(404, "Convocatória não encontrada");
    await conv.destroy();
    return res.status(200).json({ mensagem: "Convocatória removida com sucesso" });
  } catch (e) {
    return responderErro(res, e, "remover convocatória");
  }
};

// ---------- Medidas disciplinares ----------

var normalizarMedida = function (body, criar) {
  var out = {};
  ["numero_processo", "colaborador_id", "convocatoria_id", "infracao", "medida", "fundamentacao", "autoridade_decisora", "notificacao_forma", "comprovativo_url", "comprovativo_nome", "observacoes"].forEach(function (campo) {
    if (body[campo] !== undefined) {
      var limite = campo === "numero_processo" ? 40 : (campo === "colaborador_id" || campo === "convocatoria_id" ? 36 : (campo === "medida" ? 60 : (campo === "autoridade_decisora" ? 200 : (campo === "notificacao_forma" ? 50 : (campo === "comprovativo_url" ? 500 : null)))));
      out[campo] = texto(body[campo], limite);
    }
  });
  ["data_decisao", "data_inicio", "data_fim", "notificacao_data", "prazo_limite"].forEach(function (campo) {
    if (body[campo] !== undefined) out[campo] = dataValida(body[campo]);
  });
  if (body.situacao !== undefined) {
    var situacao = texto(body.situacao, 30);
    if (situacao && SITUACOES_MEDIDA.indexOf(situacao) === -1) throw erro(400, "Situação do processo inválida");
    out.situacao = situacao;
  }
  if (out.medida && MEDIDAS.indexOf(out.medida) === -1) throw erro(400, "Medida disciplinar inválida");
  if (criar) out.situacao = out.situacao || "Em_analise";
  return out;
};

var validarMedida = function (dados) {
  if (!dados.numero_processo) throw erro(400, "Indique o número do processo");
  if (!dados.colaborador_id) throw erro(400, "Selecione o trabalhador");
  if (!dados.infracao) throw erro(400, "Descreva a infracção");
  if (!dados.medida) throw erro(400, "Selecione a medida aplicada");
  if (dados.data_inicio && dados.data_fim && dados.data_fim < dados.data_inicio) {
    throw erro(400, "A data de fim não pode ser anterior à data de início");
  }
};

var serializarMedidas = async function (rows) {
  var ids = [];
  rows.forEach(function (r) { if (r.registado_por) ids.push(r.registado_por); });
  var nomes = await nomesUtilizadores(ids);
  return rows.map(function (r) {
    var o = r.toJSON();
    o.registado_por_nome = r.registado_por ? (nomes[r.registado_por] || "Utilizador") : null;
    return o;
  });
};

var listMedidas = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = Math.min(parseInt(req.query.limit) || 15, 200);
    var offset = (page - 1) * limit;
    var search = texto(req.query.search, 100);
    var situacao = texto(req.query.situacao, 30);
    var medida = texto(req.query.medida, 60);
    var colaborador_id = texto(req.query.colaborador_id, 36);
    var de = dataValida(req.query.de);
    var ate = dataValida(req.query.ate);

    var where = scopedWhere(req);
    if (situacao) where.situacao = situacao;
    if (medida) where.medida = medida;
    if (colaborador_id) where.colaborador_id = colaborador_id;
    if (de || ate) {
      where.data_decisao = {};
      if (de) where.data_decisao[Op.gte] = de;
      if (ate) where.data_decisao[Op.lte] = ate;
    }
    if (search) {
      where[Op.or] = [
        { numero_processo: { [Op.like]: "%" + search + "%" } },
        { infracao: { [Op.like]: "%" + search + "%" } },
        { autoridade_decisora: { [Op.like]: "%" + search + "%" } },
      ];
    }

    var { count, rows } = await MedidaDisciplinar.findAndCountAll({
      where: where,
      include: [{ model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"], required: false }],
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

    return res.status(200).json({
      dados: await serializarMedidas(rows),
      paginacao: { total: count, pagina: page, limite: limit, total_paginas: Math.ceil(count / limit) || 1 },
      situacoes: SITUACOES_MEDIDA,
      medidas: MEDIDAS,
    });
  } catch (e) {
    return responderErro(res, e, "listar medidas");
  }
};

var resumoMedidas = async function (req, res) {
  try {
    var where = scopedWhere(req);
    var hoje = hojeISO();
    var em7 = new Date();
    em7.setDate(em7.getDate() + 7);
    var limite = em7.toISOString().slice(0, 10);

    var total = await MedidaDisciplinar.count({ where: where });
    var emAnalise = await MedidaDisciplinar.count({ where: scopedWhere(req, { situacao: "Em_analise" }) });
    var notificadas = await MedidaDisciplinar.count({ where: scopedWhere(req, { situacao: "Notificada" }) });
    var cumpridas = await MedidaDisciplinar.count({ where: scopedWhere(req, { situacao: "Cumprida" }) });
    var prazosRisco = await MedidaDisciplinar.count({
      where: scopedWhere(req, {
        prazo_limite: { [Op.ne]: null, [Op.lte]: limite },
        situacao: { [Op.notIn]: ["Cumprida", "Arquivada"] },
      }),
    });
    var vencidos = await MedidaDisciplinar.count({
      where: scopedWhere(req, {
        prazo_limite: { [Op.ne]: null, [Op.lt]: hoje },
        situacao: { [Op.notIn]: ["Cumprida", "Arquivada"] },
      }),
    });

    return res.status(200).json({
      dados: {
        total: total,
        em_analise: emAnalise,
        notificadas: notificadas,
        cumpridas: cumpridas,
        prazos_em_risco: prazosRisco,
        vencidos: vencidos,
        hoje: hoje,
      },
      situacoes: SITUACOES_MEDIDA,
      medidas: MEDIDAS,
    });
  } catch (e) {
    return responderErro(res, e, "resumo de medidas");
  }
};

var getMedida = async function (req, res) {
  try {
    var med = await MedidaDisciplinar.findOne({
      where: scopedWhere(req, { id: req.params.id }),
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "email_pessoal", "telefone"], required: false },
        { model: ConvocatoriaDisciplinar, as: "convocatoria", required: false },
      ],
    });
    if (!med) throw erro(404, "Medida disciplinar não encontrada");
    return res.status(200).json({ dados: (await serializarMedidas([med]))[0] });
  } catch (e) {
    return responderErro(res, e, "ver medida");
  }
};

var createMedida = async function (req, res) {
  try {
    var dados = normalizarMedida(req.body, true);
    if (!dados.numero_processo) dados.numero_processo = await gerarNumeroProcesso(req);
    validarMedida(dados);
    var colaborador = await obterColaborador(req, dados.colaborador_id);
    dados.organizacao_id = req.organizacao_id || colaborador.organizacao_id || null;
    dados.registado_por = req.utilizador ? req.utilizador.id : null;

    var medida = await MedidaDisciplinar.create(dados);
    var completa = await MedidaDisciplinar.findByPk(medida.id, {
      include: [{ model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"], required: false }],
    });

    await notificarColaborador(
      colaborador,
      "Registo de medida disciplinar",
      "Foi registada uma medida disciplinar no processo " + medida.numero_processo + ". Consulte a sua situação no portal.",
      "/dashboard/portal"
    );

    return res.status(201).json({ mensagem: "Medida disciplinar registada com sucesso", dados: (await serializarMedidas([completa]))[0] });
  } catch (e) {
    return responderErro(res, e, "criar medida");
  }
};

var updateMedida = async function (req, res) {
  try {
    var med = await MedidaDisciplinar.findOne({ where: scopedWhere(req, { id: req.params.id }) });
    if (!med) throw erro(404, "Medida disciplinar não encontrada");

    var dados = normalizarMedida(req.body, false);
    if (dados.colaborador_id) {
      var colaborador = await obterColaborador(req, dados.colaborador_id);
      med.colaborador_id = colaborador.id;
      delete dados.colaborador_id;
    }
    if (dados.numero_processo === null) delete dados.numero_processo;
    if (dados.situacao === null) delete dados.situacao;
    if (dados.infracao === null) delete dados.infracao;
    if (dados.medida === null) delete dados.medida;

    await med.update(dados);
    var completa = await MedidaDisciplinar.findByPk(med.id, {
      include: [{ model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"], required: false }],
    });
    return res.status(200).json({ mensagem: "Medida disciplinar actualizada com sucesso", dados: (await serializarMedidas([completa]))[0] });
  } catch (e) {
    return responderErro(res, e, "actualizar medida");
  }
};

var removeMedida = async function (req, res) {
  try {
    var med = await MedidaDisciplinar.findOne({ where: scopedWhere(req, { id: req.params.id }) });
    if (!med) throw erro(404, "Medida disciplinar não encontrada");
    await med.destroy();
    return res.status(200).json({ mensagem: "Medida disciplinar removida com sucesso" });
  } catch (e) {
    return responderErro(res, e, "remover medida");
  }
};

module.exports = {
  ESTADOS_CONVOCATORIA,
  SITUACOES_MEDIDA,
  MEDIDAS,
  listConvocatorias,
  getConvocatoria,
  createConvocatoria,
  updateConvocatoria,
  removeConvocatoria,
  listMedidas,
  resumoMedidas,
  getMedida,
  createMedida,
  updateMedida,
  removeMedida,
};
