var { Op } = require("sequelize");
var { Aviso, ComunicacaoAnexo, Utilizador, Colaborador, Departamento } = require("../models");
var { perfisUtilizador, fundirPermissoes } = require("../protect/rbac");

// Limites dos anexos (guardados na BD em base64): ate 8 ficheiros, cada um
// ate ~10MB depois de codificado em base64.
var MAX_ANEXOS = 8;
var MAX_ANEXO_B64 = 14 * 1024 * 1024;

var isGestor = function (req) {
  if (!req.utilizador) return false;
  var perfis = perfisUtilizador(req.utilizador);
  var fundido = fundirPermissoes(perfis);
  if (fundido.nivel >= 4) return true;
  // Matriz de permissoes: quem pode criar/actualizar comunicados e gestor
  if (fundido.permissoes.comunicados &&
    (fundido.permissoes.comunicados.indexOf("create") !== -1 ||
     fundido.permissoes.comunicados.indexOf("update") !== -1)) {
    return true;
  }
  var rolesPermitidas = ["Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"];
  return perfis.some(function (p) {
    return p && rolesPermitidas.indexOf(p.nome) !== -1;
  });
};

var incluirAnexos = [
  { model: Utilizador, as: "criador", attributes: ["id", "nome_completo", "email"] },
  { model: Departamento, as: "departamento", attributes: ["id", "nome"] },
  { model: ComunicacaoAnexo, as: "anexos", attributes: ["id", "nome", "tipo", "tamanho", "createdAt"] },
];

// Normaliza "dados" (pode vir como data URI "data:...;base64,XXXX" ou base64 puro)
var extrairBase64 = function (dados) {
  if (typeof dados !== "string") return "";
  var pos = dados.indexOf("base64,");
  if (pos !== -1) {
    return dados.slice(pos + "base64,".length);
  }
  return dados;
};

var criarAnexos = async function (comunicadoId, anexos) {
  if (!Array.isArray(anexos) || anexos.length === 0) return 0;
  var criados = 0;
  for (var i = 0; i < anexos.length && i < MAX_ANEXOS; i++) {
    var a = anexos[i];
    if (!a || !a.nome || !a.dados) continue;
    var b64 = extrairBase64(a.dados);
    if (!b64 || b64.length > MAX_ANEXO_B64) continue;
    await ComunicacaoAnexo.create({
      comunicado_id: comunicadoId,
      nome: String(a.nome).slice(0, 255),
      tipo: a.tipo ? String(a.tipo).slice(0, 150) : null,
      tamanho: a.tamanho ? parseInt(a.tamanho, 10) : null,
      dados: b64,
    });
    criados++;
  }
  return criados;
};

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var tipo = req.query.tipo;
    var publicado = req.query.publicado;
    var gestor = isGestor(req);

    var where = {
      organizacao_id: req.utilizador.organizacao_id,
    };

    if (!gestor) {
      where.publicado = true;
      var dataActual = new Date();
      where[Op.or] = [
        { data_fim: null },
        { data_fim: { [Op.gte]: dataActual } },
      ];
    } else {
      if (publicado !== undefined) {
        where.publicado = publicado === "true" || publicado === "1";
      }
    }

    if (search) {
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({
        [Op.or]: [
          { titulo: { [Op.like]: "%" + search + "%" } },
          { conteudo: { [Op.like]: "%" + search + "%" } },
        ],
      });
    }

    if (tipo) {
      where.tipo = tipo;
    }

    var { count, rows } = await Aviso.findAndCountAll({
      where: where,
      include: incluirAnexos,
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
      distinct: true,
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
    console.log("Erro ao listar comunicados:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var get = async function (req, res) {
  try {
    var aviso = await Aviso.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
      include: incluirAnexos,
    });

    if (!aviso) {
      return res.status(404).json({ error: "Comunicado nao encontrado" });
    }

    if (!aviso.publicado && !isGestor(req)) {
      return res.status(403).json({ error: "Comunicado nao disponivel" });
    }

    return res.status(200).json({ dados: aviso });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var create = async function (req, res) {
  try {
    var dados = req.body;

    if (!dados.titulo) {
      return res.status(400).json({ error: "titulo e obrigatorio" });
    }
    if (!dados.conteudo) {
      return res.status(400).json({ error: "conteudo e obrigatorio" });
    }

    var anexos = dados.anexos;
    var payload = {};
    Object.keys(dados).forEach(function (k) {
      if (k !== "anexos") payload[k] = dados[k];
    });

    payload.organizacao_id = req.utilizador.organizacao_id;
    payload.criado_por = req.utilizador.id;

    var aviso = await Aviso.create(payload);

    var criados = await criarAnexos(aviso.id, anexos);

    var resultado = await Aviso.findByPk(aviso.id, { include: incluirAnexos });

    return res.status(201).json({
      mensagem: criados > 0 ? "Comunicado criado com sucesso (" + criados + " anexo(s))" : "Comunicado criado com sucesso",
      dados: resultado,
    });
  } catch (e) {
    console.log("Erro ao criar comunicado:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var update = async function (req, res) {
  try {
    var aviso = await Aviso.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
    });

    if (!aviso) {
      return res.status(404).json({ error: "Comunicado nao encontrado" });
    }

    var camposProtegidos = ["id", "organizacao_id", "criado_por", "createdAt", "updatedAt", "anexos", "anexos_remover"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    await aviso.update(dadosActualizar);

    // Remover anexos pedidos
    var remover = req.body.anexos_remover;
    if (Array.isArray(remover) && remover.length > 0) {
      await ComunicacaoAnexo.destroy({
        where: { comunicado_id: aviso.id, id: { [Op.in]: remover } },
      });
    }

    // Adicionar novos anexos
    await criarAnexos(aviso.id, req.body.anexos);

    var resultado = await Aviso.findByPk(aviso.id, { include: incluirAnexos });

    return res.status(200).json({
      mensagem: "Comunicado actualizado com sucesso",
      dados: resultado,
    });
  } catch (e) {
    console.log("Erro ao actualizar comunicado:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var remove = async function (req, res) {
  try {
    var aviso = await Aviso.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
    });

    if (!aviso) {
      return res.status(404).json({ error: "Comunicado nao encontrado" });
    }

    await ComunicacaoAnexo.destroy({ where: { comunicado_id: aviso.id } });
    await aviso.destroy();

    return res.status(200).json({ mensagem: "Comunicado eliminado com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var togglePublicado = async function (req, res) {
  try {
    var aviso = await Aviso.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
    });

    if (!aviso) {
      return res.status(404).json({ error: "Comunicado nao encontrado" });
    }

    await aviso.update({ publicado: !aviso.publicado });

    return res.status(200).json({
      mensagem: aviso.publicado ? "Comunicado publicado" : "Comunicado despublicado",
      dados: aviso,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Download de anexo: visivel para QUALQUER utilizador autenticado da
// organizacao (desde que o comunicado esteja publicado ou o utilizador seja
// gestor). O ficheiro vem da BD, nao do disco.
var downloadAnexo = async function (req, res) {
  try {
    var anexo = await ComunicacaoAnexo.findOne({
      where: { id: req.params.anexoId, comunicado_id: req.params.id },
      include: [
        { model: Aviso, as: "comunicado", attributes: ["id", "organizacao_id", "publicado", "titulo"] },
      ],
    });

    if (!anexo || !anexo.comunicado) {
      return res.status(404).json({ error: "Anexo nao encontrado" });
    }

    if (anexo.comunicado.organizacao_id !== req.utilizador.organizacao_id) {
      return res.status(404).json({ error: "Anexo nao encontrado" });
    }

    if (!anexo.comunicado.publicado && !isGestor(req)) {
      return res.status(403).json({ error: "Comunicado nao disponivel" });
    }

    var b64 = extrairBase64(anexo.dados);
    var buffer = Buffer.from(b64, "base64");

    res.setHeader("Content-Type", anexo.tipo || "application/octet-stream");
    res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(anexo.nome || "anexo"));
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  } catch (e) {
    console.log("Erro ao descarregar anexo:", e.message);
    return res.status(500).json({ error: "Erro ao descarregar anexo" });
  }
};

module.exports = { list, get, create, update, remove, togglePublicado, downloadAnexo };
