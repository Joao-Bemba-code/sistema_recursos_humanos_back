var { Op } = require("sequelize");
var { OcorrenciaDisciplinar, Colaborador, Utilizador } = require("../models");
var { requireRole } = require("../protect/rbac");
var notificacaoController = require("../controllers/notificacaoController");

var router = require("express").Router();

var generateNumero = async function () {
  var year = new Date().getFullYear();
  var count = await OcorrenciaDisciplinar.count();
  return "OD-" + year + "-" + String(count + 1).padStart(4, "0");
};

router.get("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var tipo = req.query.tipo;
    var estado = req.query.estado;
    var colaborador_id = req.query.colaborador_id;

    var where = {};
    if (search) {
      where[Op.or] = [
        { numero: { [Op.like]: "%" + search + "%" } },
        { descricao: { [Op.like]: "%" + search + "%" } },
      ];
    }
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;
    if (colaborador_id) where.colaborador_id = colaborador_id;

    var { count, rows } = await OcorrenciaDisciplinar.findAndCountAll({
      where: where,
      include: [
        {
          model: Colaborador,
          as: "colaborador",
          attributes: ["id", "nome_completo", "numero_colaborador"],
        },
      ],
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
    console.log("Erro ao listar ocorrências:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"), async function (req, res) {
  try {
    var ocorrencia = await OcorrenciaDisciplinar.findByPk(req.params.id, {
      include: [
        {
          model: Colaborador,
          as: "colaborador",
          attributes: ["id", "nome_completo", "numero_colaborador", "email_pessoal", "telefone"],
        },
      ],
    });

    if (!ocorrencia) {
      return res.status(404).json({ error: "Ocorrência não encontrada" });
    }

    return res.status(200).json({ dados: ocorrencia });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.post("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), async function (req, res) {
  try {
    var {
      colaborador_id, tipo, data_ocorrencia, descricao,
      testemunhas, providencias, penalidade,
      duracao_suspensao, documento,
    } = req.body;

    if (!colaborador_id || !tipo || !data_ocorrencia || !descricao) {
      return res.status(400).json({ error: "Campos obrigatórios: colaborador_id, tipo, data_ocorrencia, descricao" });
    }

    var colaborador = await Colaborador.findByPk(colaborador_id);
    if (!colaborador) {
      return res.status(404).json({ error: "Colaborador não encontrado" });
    }

    var numero = await generateNumero();

    var ocorrencia = await OcorrenciaDisciplinar.create({
      numero: numero,
      colaborador_id: colaborador_id,
      tipo: tipo,
      data_ocorrencia: data_ocorrencia,
      descricao: descricao,
      testemunhas: testemunhas || null,
      providencias: providencias || null,
      penalidade: penalidade || null,
      duracao_suspensao: duracao_suspensao || null,
      documento: documento || null,
      registado_por: req.utilizador ? req.utilizador.id : null,
      estado: "Registada",
    });

    var completa = await OcorrenciaDisciplinar.findByPk(ocorrencia.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    if (colaborador && colaborador.utilizador_id) {
      try {
        await notificacaoController.create({
          organizacao_id: req.utilizador.organizacao_id,
          utilizador_id: colaborador.utilizador_id,
          titulo: "Nova Advertência",
          mensagem: "Foi registada uma ocorrência ('" + tipo + "') na sua ficha: " + (descricao.length > 140 ? descricao.slice(0, 140) + "…" : descricao),
          tipo: "warning",
          link: "/dashboard/portal",
          modulo: "advertencias",
        });
      } catch (notifErr) {
        console.log("Aviso: notificacao de advertencia nao criada:", notifErr.message);
      }
    }

    return res.status(201).json({
      mensagem: "Ocorrência registada com sucesso",
      dados: completa,
    });
  } catch (e) {
    console.log("Erro ao criar ocorrência:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.put("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), async function (req, res) {
  try {
    var ocorrencia = await OcorrenciaDisciplinar.findByPk(req.params.id);
    if (!ocorrencia) {
      return res.status(404).json({ error: "Ocorrência não encontrada" });
    }

    var camposPermitidos = [
      "tipo", "data_ocorrencia", "descricao", "testemunhas",
      "providencias", "penalidade", "duracao_suspensao", "estado", "documento",
    ];
    var dadosActualizar = {};

    for (var i = 0; i < camposPermitidos.length; i++) {
      var campo = camposPermitidos[i];
      if (req.body[campo] !== undefined) {
        dadosActualizar[campo] = req.body[campo];
      }
    }

    await ocorrencia.update(dadosActualizar);

    var actualizada = await OcorrenciaDisciplinar.findByPk(ocorrencia.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Ocorrência actualizada com sucesso",
      dados: actualizada,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.delete("/:id", requireRole("Administrador Geral", "Director Geral"), async function (req, res) {
  try {
    var ocorrencia = await OcorrenciaDisciplinar.findByPk(req.params.id);
    if (!ocorrencia) {
      return res.status(404).json({ error: "Ocorrência não encontrada" });
    }

    await ocorrencia.destroy();

    return res.status(200).json({ mensagem: "Ocorrência eliminada com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

module.exports = router;
