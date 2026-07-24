var { Op } = require("sequelize");
var { CursoFormacao, InscricaoFormacao, Colaborador } = require("../models");

// ==================== CURSOS ====================

var listCursos = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var tipo = req.query.tipo;

    var where = {};
    if (search) {
      where[Op.or] = [
        { nome: { [Op.like]: "%" + search + "%" } },
        { descricao: { [Op.like]: "%" + search + "%" } },
        { categoria: { [Op.like]: "%" + search + "%" } },
        { local: { [Op.like]: "%" + search + "%" } },
      ];
    }
    if (estado) where.estado = estado;
    if (tipo) where.tipo = tipo;

    var { count, rows } = await CursoFormacao.findAndCountAll({
      where: where,
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
    console.log("Erro ao listar cursos de formacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getCurso = async function (req, res) {
  try {
    var curso = await CursoFormacao.findByPk(req.params.id, {
      include: [
        { model: InscricaoFormacao, as: "inscricoes", include: [
          { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
        ] },
      ],
    });

    if (!curso) {
      return res.status(404).json({ error: "Curso de formacao nao encontrado" });
    }

    return res.status(200).json({ dados: curso });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var createCurso = async function (req, res) {
  try {
    var dados = req.body;

    if (!dados.nome) {
      return res.status(400).json({ error: "nome e obrigatorio" });
    }

    var curso = await CursoFormacao.create(dados);

    return res.status(201).json({
      mensagem: "Curso de formacao criado com sucesso",
      dados: curso,
    });
  } catch (e) {
    console.log("Erro ao criar curso de formacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var updateCurso = async function (req, res) {
  try {
    var curso = await CursoFormacao.findByPk(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: "Curso de formacao nao encontrado" });
    }

    var camposProtegidos = ["id", "createdAt", "updatedAt"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    await curso.update(dadosActualizar);

    return res.status(200).json({
      mensagem: "Curso de formacao actualizado com sucesso",
      dados: curso,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var removeCurso = async function (req, res) {
  try {
    var curso = await CursoFormacao.findByPk(req.params.id);
    if (!curso) {
      return res.status(404).json({ error: "Curso de formacao nao encontrado" });
    }

    var temInscricoes = await InscricaoFormacao.count({ where: { curso_id: req.params.id } });
    if (temInscricoes > 0) {
      return res.status(400).json({ error: "Nao e possivel eliminar curso com inscricoes associadas" });
    }

    await curso.destroy();

    return res.status(200).json({ mensagem: "Curso de formacao eliminado com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== INSCRICOES ====================

var listInscricoes = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var curso_id = req.query.curso_id;
    var colaborador_id = req.query.colaborador_id;

    var where = {};
    if (estado) where.estado = estado;
    if (curso_id) where.curso_id = curso_id;
    if (colaborador_id) where.colaborador_id = colaborador_id;

    var include = [
      { model: CursoFormacao, as: "curso", attributes: ["id", "nome", "tipo", "data_inicio", "data_fim"] },
      { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
    ];

    if (search) {
      include[0].where = { nome: { [Op.like]: "%" + search + "%" } };
    }

    var { count, rows } = await InscricaoFormacao.findAndCountAll({
      where: where,
      include: include,
      order: [["data_inscricao", "DESC"]],
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
    console.log("Erro ao listar inscricoes de formacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var createInscricao = async function (req, res) {
  try {
    var dados = req.body;

    if (!dados.curso_id || !dados.colaborador_id) {
      return res.status(400).json({ error: "curso_id e colaborador_id sao obrigatorios" });
    }

    var curso = await CursoFormacao.findByPk(dados.curso_id);
    if (!curso) {
      return res.status(404).json({ error: "Curso de formacao nao encontrado" });
    }

    if (curso.vagas) {
      var inscricoesActivas = await InscricaoFormacao.count({
        where: { curso_id: dados.curso_id, estado: { [Op.in]: ["Inscrito", "Concluido"] } },
      });
      if (inscricoesActivas >= curso.vagas) {
        return res.status(400).json({ error: "Curso sem vagas disponiveis" });
      }
    }

    var inscricaoExistente = await InscricaoFormacao.findOne({
      where: { curso_id: dados.curso_id, colaborador_id: dados.colaborador_id, estado: { [Op.in]: ["Inscrito", "Concluido"] } },
    });
    if (inscricaoExistente) {
      return res.status(409).json({ error: "Colaborador ja inscrito neste curso" });
    }

    var inscricao = await InscricaoFormacao.create(dados);

    return res.status(201).json({
      mensagem: "Inscricao criada com sucesso",
      dados: inscricao,
    });
  } catch (e) {
    console.log("Erro ao criar inscricao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var updateInscricao = async function (req, res) {
  try {
    var inscricao = await InscricaoFormacao.findByPk(req.params.id);
    if (!inscricao) {
      return res.status(404).json({ error: "Inscricao nao encontrada" });
    }

    var camposProtegidos = ["id", "curso_id", "colaborador_id", "createdAt", "updatedAt"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    if (req.body.estado === "Certificado") {
      dadosActualizar.certificado = true;
      if (!dadosActualizar.data_certificado) {
        dadosActualizar.data_certificado = new Date();
      }
    }

    await inscricao.update(dadosActualizar);

    var actualizado = await InscricaoFormacao.findByPk(req.params.id, {
      include: [
        { model: CursoFormacao, as: "curso", attributes: ["id", "nome", "tipo"] },
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Inscricao actualizada com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { listCursos, getCurso, createCurso, updateCurso, removeCurso, listInscricoes, createInscricao, updateInscricao };
