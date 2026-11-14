var { Departamento, Cargo, Seccao, Unidade, UnidadeSeccao } = require("../models");
var { Op } = require("sequelize");
var { ORG_INEXISTENTE } = require("../helpers/organizacao");

exports.listar = async (req, res, next) => {
  try {
    const { page = 1, limit = 15, search = "", tipo = "", departamento_id = "", seccao_id = "", unidade_id = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const organizacaoId = req.organizacao_id || ORG_INEXISTENTE;

    const where = { organizacao_id: organizacaoId };
    if (search) {
      where[Op.or] = [
        { nome: { [Op.like]: `%${search}%` } },
        { codigo: { [Op.like]: `%${search}%` } },
        { responsavel_nome: { [Op.like]: `%${search}%` } },
      ];
    }
    if (tipo) where.tipo = tipo;
    if (departamento_id) where.id = departamento_id;

    if (seccao_id || unidade_id) {
      const seccaoWhere = { organizacao_id: organizacaoId };
      if (seccao_id) seccaoWhere.id = seccao_id;
      if (unidade_id) {
        const unidade = await Unidade.findOne({
          where: { id: unidade_id, organizacao_id: organizacaoId },
          attributes: ["id"],
        });
        if (!unidade) {
          return res.json({ dados: [], paginacao: { total: 0, pagina: parseInt(page), limit: parseInt(limit), total_paginas: 0 } });
        }
        const ligacoes = await UnidadeSeccao.findAll({
          where: { unidade_id: unidade.id },
          attributes: ["seccao_id"],
        });
        const idsSeccao = ligacoes.map(function (l) { return l.seccao_id; }).filter(Boolean);
        if (idsSeccao.length === 0) {
          return res.json({ dados: [], paginacao: { total: 0, pagina: parseInt(page), limit: parseInt(limit), total_paginas: 0 } });
        }
        seccaoWhere.id = { [Op.in]: idsSeccao };
      }

      const seccoes = await Seccao.findAll({ where: seccaoWhere, attributes: ["departamento_id"] });
      const idsDept = [];
      seccoes.forEach(function (s) {
        if (s.departamento_id && idsDept.indexOf(s.departamento_id) === -1) idsDept.push(s.departamento_id);
      });
      if (idsDept.length === 0) {
        return res.json({ dados: [], paginacao: { total: 0, pagina: parseInt(page), limit: parseInt(limit), total_paginas: 0 } });
      }
      where.id = { [Op.in]: idsDept };
    }

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
    const dept = await Departamento.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!dept) return res.status(404).json({ error: "Departamento não encontrado" });
    res.json({ dados: dept });
  } catch (e) {
    next(e);
  }
};

exports.criar = async (req, res, next) => {
  try {
    var dados = req.body;
    if (!req.organizacao_id) {
      return res.status(403).json({ error: "Conta sem organizacao associada" });
    }
    dados.organizacao_id = req.organizacao_id;
    const dept = await Departamento.create(dados);
    res.status(201).json({ dados: dept, message: "Departamento criado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.actualizar = async (req, res, next) => {
  try {
    const dept = await Departamento.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!dept) return res.status(404).json({ error: "Departamento não encontrado" });
    const dados = Object.assign({}, req.body);
    delete dados.id;
    delete dados.organizacao_id;
    await dept.update(dados);
    res.json({ dados: dept, message: "Departamento actualizado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.eliminar = async (req, res, next) => {
  try {
    const dept = await Departamento.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
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
