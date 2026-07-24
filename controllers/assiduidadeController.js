var { Op } = require("sequelize");
var { RegistoPresenca, Colaborador } = require("../models");

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var metodo = req.query.metodo;
    var colaborador_id = req.query.colaborador_id;
    var data_inicio = req.query.data_inicio;
    var data_fim = req.query.data_fim;

    var where = {};
    if (search) {
      where[Op.or] = [
        { observacoes: { [Op.like]: "%" + search + "%" } },
      ];
    }
    if (estado) where.estado = estado;
    if (metodo) where.metodo = metodo;
    if (colaborador_id) where.colaborador_id = colaborador_id;
    if (data_inicio && data_fim) {
      where.data = { [Op.between]: [data_inicio, data_fim] };
    } else if (data_inicio) {
      where.data = { [Op.gte]: data_inicio };
    } else if (data_fim) {
      where.data = { [Op.lte]: data_fim };
    }

    var { count, rows } = await RegistoPresenca.findAndCountAll({
      where: where,
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
      order: [["data", "DESC"], ["hora_entrada", "DESC"]],
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
    console.log("Erro ao listar registos de presenca:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getById = async function (req, res) {
  try {
    var registo = await RegistoPresenca.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    if (!registo) {
      return res.status(404).json({ error: "Registo de presenca nao encontrado" });
    }

    return res.status(200).json({ dados: registo });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var create = async function (req, res) {
  try {
    var dados = req.body;

    if (!dados.colaborador_id || !dados.data) {
      return res.status(400).json({ error: "colaborador_id e data sao obrigatorios" });
    }

    if (dados.hora_entrada && dados.hora_saida) {
      var entrada = new Date("1970-01-01T" + dados.hora_entrada);
      var saida = new Date("1970-01-01T" + dados.hora_saida);
      var diff = (saida - entrada) / (1000 * 60 * 60);
      dados.horas_trabalhadas = Math.round(diff * 100) / 100;
      if (diff > 8) {
        dados.horas_extras = Math.round((diff - 8) * 100) / 100;
      }
    }

    var registo = await RegistoPresenca.create(dados);

    return res.status(201).json({
      mensagem: "Registo de presenca criado com sucesso",
      dados: registo,
    });
  } catch (e) {
    console.log("Erro ao criar registo de presenca:", e.message);
    if (e.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Ja existe um registo para este colaborador nesta data" });
    }
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var update = async function (req, res) {
  try {
    var registo = await RegistoPresenca.findByPk(req.params.id);
    if (!registo) {
      return res.status(404).json({ error: "Registo de presenca nao encontrado" });
    }

    var camposProtegidos = ["id", "colaborador_id", "createdAt", "updatedAt"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    var horaEntrada = dadosActualizar.hora_entrada || registo.hora_entrada;
    var horaSaida = dadosActualizar.hora_saida || registo.hora_saida;
    if (horaEntrada && horaSaida) {
      var entrada = new Date("1970-01-01T" + horaEntrada);
      var saida = new Date("1970-01-01T" + horaSaida);
      var diff = (saida - entrada) / (1000 * 60 * 60);
      dadosActualizar.horas_trabalhadas = Math.round(diff * 100) / 100;
      dadosActualizar.horas_extras = diff > 8 ? Math.round((diff - 8) * 100) / 100 : 0;
    }

    await registo.update(dadosActualizar);

    var actualizado = await RegistoPresenca.findByPk(req.params.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Registo de presenca actualizado com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var remove = async function (req, res) {
  try {
    var registo = await RegistoPresenca.findByPk(req.params.id);
    if (!registo) {
      return res.status(404).json({ error: "Registo de presenca nao encontrado" });
    }

    await registo.destroy();

    return res.status(200).json({ mensagem: "Registo de presenca eliminado com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { list, getById, create, update, remove };
