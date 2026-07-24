var { Departamento, Cargo } = require("../models");
var { Op } = require("sequelize");

exports.listar = async (req, res, next) => {
  try {
    const { page = 1, limit = 15, search = "", tipo = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where[Op.or] = [
        { nome: { [Op.like]: `%${search}%` } },
        { codigo: { [Op.like]: `%${search}%` } },
        { responsavel_nome: { [Op.like]: `%${search}%` } },
      ];
    }
    if (tipo) where.tipo = tipo;

    const { count, rows } = await Departamento.findAndCountAll({
      where,
      order: [["nome", "ASC"]],
      limit: parseInt(limit),
      offset,
    });

    const total_paginas = Math.ceil(count / parseInt(limit));

    res.json({
      dados: rows,
      paginacao: {
        total: count,
        pagina: parseInt(page),
        limit: parseInt(limit),
        total_paginas,
      },
    });
  } catch (e) {
    next(e);
  }
};

exports.obter = async (req, res, next) => {
  try {
    const dept = await Departamento.findByPk(req.params.id);
    if (!dept) return res.status(404).json({ error: "Departamento não encontrado" });
    res.json({ dados: dept });
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
    const dept = await Departamento.create(dados);
    res.status(201).json({ dados: dept, message: "Departamento criado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.actualizar = async (req, res, next) => {
  try {
    const dept = await Departamento.findByPk(req.params.id);
    if (!dept) return res.status(404).json({ error: "Departamento não encontrado" });
    await dept.update(req.body);
    res.json({ dados: dept, message: "Departamento actualizado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.eliminar = async (req, res, next) => {
  try {
    const dept = await Departamento.findByPk(req.params.id);
    if (!dept) return res.status(404).json({ error: "Departamento não encontrado" });
    await dept.destroy();
    res.json({ message: "Departamento eliminado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.cargos = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (search) {
      where[Op.or] = [
        { nome: { [Op.like]: `%${search}%` } },
        { codigo: { [Op.like]: `%${search}%` } },
      ];
    }
    const { count, rows } = await Cargo.findAndCountAll({
      where,
      order: [["nome", "ASC"]],
      limit: parseInt(limit),
      offset,
    });
    res.json({
      dados: rows,
      paginacao: { total: count, pagina: parseInt(page), limit: parseInt(limit), total_paginas: Math.ceil(count / parseInt(limit)) },
    });
  } catch (e) {
    next(e);
  }
};
