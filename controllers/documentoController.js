var path = require("path");
var { Colaborador, ColaboradorDocumento, ColaboradorDocumentoEvento, Utilizador } = require("../models");
var { lerBufferDeUrl, nomeDeReferencia } = require("../helpers/ficheiros");

// Categorias fixas do separador Documentos. "outro" aceita varios registos.
var CATEGORIAS_FIXAS = ["fotografia", "curriculo", "bi", "certificado", "contrato"];
var CATEGORIAS = CATEGORIAS_FIXAS.concat(["outro"]);
var CATEGORIA_LABEL = {
  fotografia: "Fotografia",
  curriculo: "Currículo (CV)",
  bi: "Bilhete de Identidade ou equivalente",
  certificado: "Certificado de habilitações ou formação",
  contrato: "Contrato de trabalho assinado",
  outro: "Outro documento",
};
var ESTADOS = ["Em falta", "Por conferir", "Validado", "A corrigir"];

var MIME_POR_EXTENSAO = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

var erro = function (status, mensagem) {
  var e = new Error(mensagem);
  e.status = status;
  return e;
};

var responderErro = function (res, e, contexto) {
  var status = e.status || 500;
  if (status >= 500) {
    console.log("Erro " + (contexto || "documentos") + ":", e.message);
  }
  return res.status(status).json({ error: status >= 500 ? "Erro interno do servidor" : e.message });
};

var categoriaValida = function (categoria) {
  return CATEGORIAS.indexOf(categoria) !== -1;
};

var estadoValido = function (estado) {
  return ESTADOS.indexOf(estado) !== -1;
};

var texto = function (valor, limite) {
  if (valor === undefined || valor === null) return null;
  var s = String(valor).trim();
  if (!s) return null;
  return limite ? s.slice(0, limite) : s;
};

// Aceita apenas referencias internas ou URLs http(s). Evita javascript: e
// caminhos estranhos guardados por engano.
var urlPermitida = function (url) {
  if (!url) return false;
  return /^https?:\/\//i.test(url) ||
    url.indexOf("/uploads/") === 0 ||
    /^\/api\/ficheiros\/[0-9a-fA-F-]{36}$/.test(url);
};

var obterColaborador = async function (req, id) {
  var colaborador = await Colaborador.findByPk(id);
  if (!colaborador) throw erro(404, "Colaborador não encontrado");
  if (colaborador.organizacao_id && req.organizacao_id && String(colaborador.organizacao_id) !== String(req.organizacao_id)) {
    throw erro(404, "Colaborador não encontrado");
  }
  return colaborador;
};

var registarEvento = async function (doc, acao, anterior, novo, utilizadorId, motivo, urlAnterior) {
  try {
    await ColaboradorDocumentoEvento.create({
      documento_id: doc.id,
      colaborador_id: doc.colaborador_id,
      organizacao_id: doc.organizacao_id || null,
      acao: acao,
      estado_anterior: anterior || null,
      estado_novo: novo || null,
      ficheiro_url: doc.ficheiro_url || null,
      ficheiro_url_anterior: urlAnterior || null,
      ficheiro_nome: doc.ficheiro_nome || null,
      motivo: motivo || null,
      utilizador_id: utilizadorId || null,
    });
  } catch (e) {
    console.log("Aviso: nao foi possivel registar evento do documento:", e.message);
  }
};

// Mantem as colunas antigas da ficha sincronizadas (avatares, PDF, etc.).
var sincronizarLegado = async function (colaborador, categoria, url) {
  if (categoria !== "fotografia" && categoria !== "curriculo") return;
  var valor = url || null;
  var actual = colaborador[categoria] || null;
  if (String(actual || "") === String(valor || "")) return;
  var dados = {};
  dados[categoria] = valor;
  try {
    await colaborador.update(dados);
  } catch (e) {
    console.log("Aviso: nao foi possivel sincronizar " + categoria + " do colaborador:", e.message);
  }
};

// Converte o item recebido do formulario. So inclui as chaves que vieram no
// pedido, para uma actualizacao de estado nao apagar tipo/descricao.
var normalizarItem = function (item) {
  item = item || {};
  var out = { categoria: texto(item.categoria, 30) || "" };
  if (item.id) out.id = String(item.id);
  if (item.tipo_documento !== undefined) out.tipo_documento = texto(item.tipo_documento, 150);
  if (item.descricao !== undefined) out.descricao = texto(item.descricao, 2000);
  if (item.ficheiro_url !== undefined) out.ficheiro_url = texto(item.ficheiro_url, 500);
  if (item.ficheiro_nome !== undefined) out.ficheiro_nome = texto(item.ficheiro_nome, 255);
  if (item.ficheiro_tipo !== undefined) out.ficheiro_tipo = texto(item.ficheiro_tipo, 150);
  if (item.ficheiro_tamanho !== undefined) out.ficheiro_tamanho = parseInt(item.ficheiro_tamanho, 10) || null;
  if (item.estado !== undefined) out.estado = texto(item.estado, 30);
  if (item.motivo_correcao !== undefined || item.motivo !== undefined) {
    out.motivo_correcao = texto(item.motivo_correcao || item.motivo, 2000);
  }
  return out;
};

var criarDocumento = async function (colaborador, item, utilizador) {
  if (!categoriaValida(item.categoria)) {
    throw erro(400, "Categoria de documento inválida");
  }
  if (!item.ficheiro_url) {
    throw erro(400, "Carregue o ficheiro do documento");
  }
  if (!urlPermitida(item.ficheiro_url)) {
    throw erro(400, "Referência de ficheiro inválida");
  }

  var estado = item.estado && estadoValido(item.estado) ? item.estado : "Por conferir";
  if (estado === "Em falta") estado = "Por conferir";
  if (estado === "A corrigir" && !item.motivo_correcao) {
    throw erro(400, "Indique o motivo da correção");
  }

  var agora = new Date();
  var doc = await ColaboradorDocumento.create({
    colaborador_id: colaborador.id,
    organizacao_id: colaborador.organizacao_id || null,
    categoria: item.categoria,
    tipo_documento: item.tipo_documento,
    descricao: item.descricao,
    ficheiro_url: item.ficheiro_url,
    ficheiro_nome: item.ficheiro_nome,
    ficheiro_tipo: item.ficheiro_tipo,
    ficheiro_tamanho: item.ficheiro_tamanho,
    estado: estado,
    motivo_correcao: estado === "A corrigir" ? item.motivo_correcao : null,
    carregado_por: utilizador ? utilizador.id : null,
    carregado_em: agora,
    validado_por: estado === "Validado" && utilizador ? utilizador.id : null,
    validado_em: estado === "Validado" ? agora : null,
  });

  await registarEvento(doc, "carregado", null, estado, utilizador ? utilizador.id : null, doc.motivo_correcao, null);
  await sincronizarLegado(colaborador, doc.categoria, doc.ficheiro_url);
  return doc;
};

var actualizarDocumento = async function (colaborador, doc, item, utilizador) {
  var estadoAnterior = doc.estado;
  var urlAnterior = doc.ficheiro_url;
  var dados = {};

  if (item.tipo_documento !== undefined && doc.categoria === "outro") dados.tipo_documento = item.tipo_documento;
  if (item.descricao !== undefined && doc.categoria === "outro") dados.descricao = item.descricao;

  var substituiu = false;
  if (item.ficheiro_url && item.ficheiro_url !== doc.ficheiro_url) {
    if (!urlPermitida(item.ficheiro_url)) throw erro(400, "Referência de ficheiro inválida");
    var agora = new Date();
    dados.ficheiro_url = item.ficheiro_url;
    dados.ficheiro_nome = item.ficheiro_nome;
    dados.ficheiro_tipo = item.ficheiro_tipo;
    dados.ficheiro_tamanho = item.ficheiro_tamanho;
    dados.carregado_por = utilizador ? utilizador.id : null;
    dados.carregado_em = agora;
    dados.estado = "Por conferir";
    dados.motivo_correcao = null;
    dados.validado_por = null;
    dados.validado_em = null;
    substituiu = true;
  }

  var novoEstado = item.estado && estadoValido(item.estado) ? item.estado : null;
  if (novoEstado && novoEstado !== "Em falta" && novoEstado !== (substituiu ? "Por conferir" : estadoAnterior)) {
    if (novoEstado === "A corrigir" && !item.motivo_correcao) {
      throw erro(400, "Indique o motivo da correção");
    }
    dados.estado = novoEstado;
    dados.motivo_correcao = novoEstado === "A corrigir" ? item.motivo_correcao : null;
    if (novoEstado === "Validado") {
      dados.validado_por = utilizador ? utilizador.id : null;
      dados.validado_em = new Date();
    } else {
      dados.validado_por = null;
      dados.validado_em = null;
    }
  }

  if (Object.keys(dados).length > 0) {
    await doc.update(dados);
  }

  if (substituiu) {
    await registarEvento(doc, "substituido", estadoAnterior, doc.estado, utilizador ? utilizador.id : null, null, urlAnterior);
    await sincronizarLegado(colaborador, doc.categoria, doc.ficheiro_url);
  }

  if (dados.estado && dados.estado !== (substituiu ? "Por conferir" : estadoAnterior)) {
    var acao = dados.estado === "Validado" ? "validado" : dados.estado === "A corrigir" ? "corrigir" : "estado";
    await registarEvento(doc, acao, substituiu ? "Por conferir" : estadoAnterior, dados.estado, utilizador ? utilizador.id : null, dados.motivo_correcao || null, null);
  }

  return doc;
};

// Aplica uma lista de documentos vinda do formulario (criar/editar
// colaborador). Itens sem id e sem ficheiro sao ignorados (slots "Em falta").
var aplicarDocumentos = async function (colaborador, lista, utilizador) {
  if (!Array.isArray(lista) || lista.length === 0) return 0;
  var aplicados = 0;

  for (var i = 0; i < lista.length; i++) {
    var item = normalizarItem(lista[i]);
    if (!item.categoria || !categoriaValida(item.categoria)) {
      throw erro(400, "Categoria de documento inválida");
    }
    if (item.categoria !== "outro" && CATEGORIAS_FIXAS.indexOf(item.categoria) === -1) {
      throw erro(400, "Categoria de documento inválida");
    }

    if (item.id) {
      var existente = await ColaboradorDocumento.findOne({
        where: { id: item.id, colaborador_id: colaborador.id },
      });
      if (!existente) throw erro(404, "Documento não encontrado");
      await actualizarDocumento(colaborador, existente, item, utilizador);
      aplicados++;
      continue;
    }

    if (!item.ficheiro_url) continue;

    if (item.categoria !== "outro") {
      var docFixo = await ColaboradorDocumento.findOne({
        where: { colaborador_id: colaborador.id, categoria: item.categoria },
      });
      if (docFixo) {
        await actualizarDocumento(colaborador, docFixo, item, utilizador);
        aplicados++;
        continue;
      }
    }

    await criarDocumento(colaborador, item, utilizador);
    aplicados++;
  }

  return aplicados;
};

var nomesUtilizadores = async function (ids) {
  var unicos = [];
  ids.forEach(function (id) {
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

var listarDocumentos = async function (colaboradorId, organizacaoId) {
  var where = { colaborador_id: colaboradorId };
  if (organizacaoId) where.organizacao_id = organizacaoId;

  var documentos = await ColaboradorDocumento.findAll({
    where: where,
    order: [["createdAt", "ASC"]],
  });

  var eventos = await ColaboradorDocumentoEvento.findAll({
    where: { colaborador_id: colaboradorId },
    order: [["createdAt", "ASC"]],
  });

  var idsUtilizadores = [];
  documentos.forEach(function (d) {
    if (d.carregado_por) idsUtilizadores.push(d.carregado_por);
    if (d.validado_por) idsUtilizadores.push(d.validado_por);
  });
  eventos.forEach(function (ev) {
    if (ev.utilizador_id) idsUtilizadores.push(ev.utilizador_id);
  });
  var nomes = await nomesUtilizadores(idsUtilizadores);

  var eventosPorDoc = {};
  eventos.forEach(function (ev) {
    var chave = String(ev.documento_id);
    if (!eventosPorDoc[chave]) eventosPorDoc[chave] = [];
    eventosPorDoc[chave].push({
      id: ev.id,
      acao: ev.acao,
      estado_anterior: ev.estado_anterior,
      estado_novo: ev.estado_novo,
      ficheiro_nome: ev.ficheiro_nome,
      motivo: ev.motivo,
      utilizador_id: ev.utilizador_id,
      utilizador_nome: ev.utilizador_id ? (nomes[ev.utilizador_id] || "Utilizador") : null,
      createdAt: ev.createdAt,
    });
  });

  return documentos.map(function (d) {
    var o = d.toJSON();
    o.carregado_por_nome = d.carregado_por ? (nomes[d.carregado_por] || "Utilizador") : null;
    o.validado_por_nome = d.validado_por ? (nomes[d.validado_por] || "Utilizador") : null;
    o.categoria_label = CATEGORIA_LABEL[d.categoria] || d.categoria;
    o.eventos = eventosPorDoc[String(d.id)] || [];
    return o;
  });
};

// Checklist completo (fixos em "Em falta" quando ainda nao existem) usado na
// ficha e no PDF.
var listarChecklist = async function (colaboradorId, organizacaoId) {
  var docs = await listarDocumentos(colaboradorId, organizacaoId);
  var fixos = CATEGORIAS_FIXAS.map(function (categoria) {
    var encontrado = null;
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].categoria === categoria) { encontrado = docs[i]; break; }
    }
    return encontrado || {
      id: null,
      categoria: categoria,
      categoria_label: CATEGORIA_LABEL[categoria],
      estado: "Em falta",
      ficheiro_url: null,
      ficheiro_nome: null,
      carregado_em: null,
      carregado_por_nome: null,
      validado_em: null,
      validado_por_nome: null,
      motivo_correcao: null,
      eventos: [],
    };
  });
  var outros = docs.filter(function (d) { return d.categoria === "outro"; });
  return fixos.concat(outros);
};

// ==================== HANDLERS HTTP ====================

var list = async function (req, res) {
  try {
    await obterColaborador(req, req.params.id);
    var docs = await listarDocumentos(req.params.id, req.organizacao_id);
    return res.status(200).json({
      dados: docs,
      categorias: CATEGORIAS.map(function (c) { return { chave: c, label: CATEGORIA_LABEL[c] }; }),
      estados: ESTADOS,
    });
  } catch (e) {
    return responderErro(res, e, "listar documentos");
  }
};

var create = async function (req, res) {
  try {
    var colaborador = await obterColaborador(req, req.params.id);
    var item = normalizarItem(req.body);
    var doc = await criarDocumento(colaborador, item, req.utilizador);
    var lista = await listarDocumentos(colaborador.id, req.organizacao_id);
    var criado = lista.filter(function (d) { return String(d.id) === String(doc.id); })[0] || doc;
    return res.status(201).json({ mensagem: "Documento carregado com sucesso", dados: criado });
  } catch (e) {
    return responderErro(res, e, "criar documento");
  }
};

var update = async function (req, res) {
  try {
    var colaborador = await obterColaborador(req, req.params.id);
    var doc = await ColaboradorDocumento.findOne({
      where: { id: req.params.docId, colaborador_id: colaborador.id },
    });
    if (!doc) throw erro(404, "Documento não encontrado");

    var item = normalizarItem(req.body);
    await actualizarDocumento(colaborador, doc, item, req.utilizador);

    var lista = await listarDocumentos(colaborador.id, req.organizacao_id);
    var actualizado = lista.filter(function (d) { return String(d.id) === String(doc.id); })[0] || doc;
    return res.status(200).json({ mensagem: "Documento actualizado com sucesso", dados: actualizado });
  } catch (e) {
    return responderErro(res, e, "actualizar documento");
  }
};

var remove = async function (req, res) {
  try {
    var colaborador = await obterColaborador(req, req.params.id);
    var doc = await ColaboradorDocumento.findOne({
      where: { id: req.params.docId, colaborador_id: colaborador.id },
    });
    if (!doc) throw erro(404, "Documento não encontrado");

    await registarEvento(doc, "removido", doc.estado, "Em falta", req.utilizador ? req.utilizador.id : null, null, doc.ficheiro_url);
    var categoria = doc.categoria;
    await doc.destroy();
    await sincronizarLegado(colaborador, categoria, null);

    return res.status(200).json({ mensagem: "Documento removido com sucesso" });
  } catch (e) {
    return responderErro(res, e, "remover documento");
  }
};

// Entrega o anexo apenas a quem tem permissao de leitura. Nunca expoe o URL
// directo do Cloudinary no ecra.
var ficheiro = async function (req, res) {
  try {
    var colaborador = await obterColaborador(req, req.params.id);
    var doc = await ColaboradorDocumento.findOne({
      where: { id: req.params.docId, colaborador_id: colaborador.id },
    });
    if (!doc || !doc.ficheiro_url) throw erro(404, "Documento não encontrado");

    var buffer = await lerBufferDeUrl(doc.ficheiro_url);
    if (!buffer) throw erro(404, "Conteúdo do documento indisponível");

    var nome = doc.ficheiro_nome || nomeDeReferencia(doc.ficheiro_url, "documento");
    var ext = path.extname(nome).toLowerCase();
    var tipo = doc.ficheiro_tipo || MIME_POR_EXTENSAO[ext] || "application/octet-stream";

    res.setHeader("Content-Type", tipo);
    res.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(nome));
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(buffer);
  } catch (e) {
    return responderErro(res, e, "servir documento");
  }
};

module.exports = {
  CATEGORIAS_FIXAS,
  CATEGORIAS,
  CATEGORIA_LABEL,
  ESTADOS,
  list,
  create,
  update,
  remove,
  ficheiro,
  aplicarDocumentos,
  listarDocumentos,
  listarChecklist,
  sincronizarLegado,
};
