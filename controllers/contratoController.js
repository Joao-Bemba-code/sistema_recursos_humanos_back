var { Contrato, Colaborador } = require("../models");
var { Op } = require("sequelize");

exports.listar = async (req, res, next) => {
  try {
    const { page = 1, limit = 15, search = "", tipo = "", estado = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {};
    if (search) {
      where[Op.or] = [
        { numero: { [Op.like]: `%${search}%` } },
        { funcao: { [Op.like]: `%${search}%` } },
      ];
    }
    if (tipo) where.tipo = tipo;
    if (estado) where.estado = estado;

    const { count, rows } = await Contrato.findAndCountAll({
      where,
      include: [{ model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] }],
      order: [["data_inicio", "DESC"]],
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
    const c = await Contrato.findByPk(req.params.id, {
      include: [{ model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] }],
    });
    if (!c) return res.status(404).json({ error: "Contrato não encontrado" });
    res.json({ dados: c });
  } catch (e) {
    next(e);
  }
};

exports.criar = async (req, res, next) => {
  try {
    const c = await Contrato.create(req.body);
    res.status(201).json({ dados: c, message: "Contrato criado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.actualizar = async (req, res, next) => {
  try {
    const c = await Contrato.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: "Contrato não encontrado" });
    await c.update(req.body);
    res.json({ dados: c, message: "Contrato actualizado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.eliminar = async (req, res, next) => {
  try {
    const c = await Contrato.findByPk(req.params.id);
    if (!c) return res.status(404).json({ error: "Contrato não encontrado" });
    await c.destroy();
    res.json({ message: "Contrato eliminado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.stats = async (req, res, next) => {
  try {
    const total = await Contrato.count();
    const activos = await Contrato.count({ where: { estado: "Activo" } });
    const expirados = await Contrato.count({ where: { estado: "Expirado" } });
    const rescindidos = await Contrato.count({ where: { estado: "Rescindido" } });

    const por_tipo = await Contrato.findAll({
      attributes: ["tipo", [require("sequelize").fn("COUNT", "id"), "total"]],
      group: ["tipo"],
    });

    res.json({
      dados: { total, activos, expirados, rescindidos, por_tipo },
    });
  } catch (e) {
    next(e);
  }
};
