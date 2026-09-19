var { Op } = require("sequelize");
var { Aviso, Utilizador, Colaborador, Departamento } = require("../models");

var isGestor = function (req) {
  if (!req.utilizador) return false;
  var perfis = [];
  if (req.utilizador.perfil) perfis.push(req.utilizador.perfil);
  (req.utilizador.perfis_extra || []).forEach(function (p) {
    if (p && !perfis.some(function (x) { return x.id === p.id; })) perfis.push(p);
  });
  var nivel = perfis.reduce(function (max, p) {
    return Math.max(max, (p && p.nivel) || 0);
  }, 0);
  if (nivel >= 4) return true;
  var rolesPermitidas = ["Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"];
  return perfis.some(function (p) {
    return p && rolesPermitidas.indexOf(p.nome) !== -1;
  });
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

    var include = [
      { model: Utilizador, as: "criador", attributes: ["id", "nome_completo", "email"] },
      { model: Departamento, as: "departamento", attributes: ["id", "nome"] },
    ];

    var { count, rows } = await Aviso.findAndCountAll({
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
      include: [
        { model: Utilizador, as: "criador", attributes: ["id", "nome_completo", "email"] },
        { model: Departamento, as: "departamento", attributes: ["id", "nome"] },
      ],
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

    dados.organizacao_id = req.utilizador.organizacao_id;
    dados.criado_por = req.utilizador.id;

    var aviso = await Aviso.create(dados);

    var resultado = await Aviso.findByPk(aviso.id, {
      include: [
        { model: Utilizador, as: "criador", attributes: ["id", "nome_completo", "email"] },
        { model: Departamento, as: "departamento", attributes: ["id", "nome"] },
      ],
    });

    return res.status(201).json({
      mensagem: "Comunicado criado com sucesso",
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

    var camposProtegidos = ["id", "organizacao_id", "criado_por", "createdAt", "updatedAt"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    await aviso.update(dadosActualizar);

    var resultado = await Aviso.findByPk(aviso.id, {
      include: [
        { model: Utilizador, as: "criador", attributes: ["id", "nome_completo", "email"] },
        { model: Departamento, as: "departamento", attributes: ["id", "nome"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Comunicado actualizado com sucesso",
      dados: resultado,
    });
  } catch (e) {
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

module.exports = { list, get, create, update, remove, togglePublicado };
