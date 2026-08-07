var { Seccao } = require("../models");
var { Op } = require("sequelize");

exports.listar = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = "", departamento_id = "", activo = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where[Op.or] = [
        { nome: { [Op.like]: `%${search}%` } },
        { codigo: { [Op.like]: `%${search}%` } },
        { responsavel_nome: { [Op.like]: `%${search}%` } },
      ];
    }
    if (departamento_id) where.departamento_id = departamento_id;
    if (req.organizacao_id) where.organizacao_id = req.organizacao_id;
    if (activo === "true") where.activo = true;
    if (activo === "false") where.activo = false;

    const { count, rows } = await Seccao.findAndCountAll({
      where,
      order: [["nivel", "ASC"], ["nome", "ASC"]],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      dados: rows,
      paginacao: {
        total: count,
        pagina: parseInt(page),
        limit: parseInt(limit),
        total_paginas: Math.ceil(count / parseInt(limit)),
      },
    });
  } catch (e) {
    next(e);
  }
};

exports.obter = async (req, res, next) => {
  try {
    const sec = await Seccao.findByPk(req.params.id);
    if (!sec) return res.status(404).json({ error: "Secção não encontrada" });
    res.json({ dados: sec });
  } catch (e) {
    next(e);
  }
};

exports.criar = async (req, res, next) => {
  try {
    var dados = req.body;
    if (req.organizacao_id) {
      dados.organizacao_id = req.organizacao_id;
    }
    if (!dados.departamento_id) {
      return res.status(400).json({ error: "O departamento é obrigatório" });
    }
    const sec = await Seccao.create(dados);
    res.status(201).json({ dados: sec, message: "Secção criada com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.actualizar = async (req, res, next) => {
  try {
    const sec = await Seccao.findByPk(req.params.id);
    if (!sec) return res.status(404).json({ error: "Secção não encontrada" });
    await sec.update(req.body);
    res.json({ dados: sec, message: "Secção actualizada com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.eliminar = async (req, res, next) => {
  try {
    const sec = await Seccao.findByPk(req.params.id);
    if (!sec) return res.status(404).json({ error: "Secção não encontrada" });
    await sec.destroy();
    res.json({ message: "Secção eliminada com sucesso" });
  } catch (e) {
    next(e);
  }
};
