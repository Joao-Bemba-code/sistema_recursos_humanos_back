var { Seccao, SeccaoMembro, Colaborador, Departamento } = require("../models");
var { Op } = require("sequelize");
var { ORG_INEXISTENTE, incluirColaboradorDaOrg, colaboradorNaOrg } = require("../helpers/organizacao");

exports.listar = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search = "", departamento_id = "", activo = "", tipo = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = { organizacao_id: req.organizacao_id || ORG_INEXISTENTE };
    if (search) {
      where[Op.or] = [
        { nome: { [Op.like]: `%${search}%` } },
        { codigo: { [Op.like]: `%${search}%` } },
        { responsavel_nome: { [Op.like]: `%${search}%` } },
      ];
    }
    if (departamento_id) where.departamento_id = departamento_id;
    if (tipo) where.tipo = tipo;
    if (activo === "true") where.activo = true;
    if (activo === "false") where.activo = false;

    const { count, rows } = await Seccao.findAndCountAll({
      where,
      include: [
        { model: Departamento, as: "departamento", attributes: ["id", "nome", "codigo", "tipo"], required: false },
      ],
      distinct: true,
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
    const sec = await Seccao.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!sec) return res.status(404).json({ error: "Secção não encontrada" });
    res.json({ dados: sec });
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
    if (!dados.departamento_id) {
      return res.status(400).json({ error: "O departamento é obrigatório" });
    }
    if (!dados.tipo) dados.tipo = "Secção";
    if (dados.tipo !== "Sector" && dados.tipo !== "Secção") {
      return res.status(400).json({ error: "O tipo deve ser Sector ou Secção" });
    }
    const dept = await Departamento.findOne({
      where: { id: dados.departamento_id, organizacao_id: req.organizacao_id },
      attributes: ["id"],
    });
    if (!dept) {
      return res.status(404).json({ error: "Departamento não encontrado nesta organização" });
    }
    const sec = await Seccao.create(dados);
    res.status(201).json({ dados: sec, message: "Secção criada com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.actualizar = async (req, res, next) => {
  try {
    const sec = await Seccao.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!sec) return res.status(404).json({ error: "Secção não encontrada" });
    const dados = Object.assign({}, req.body);
    delete dados.id;
    delete dados.organizacao_id;
    if (dados.tipo !== undefined && dados.tipo !== "Sector" && dados.tipo !== "Secção") {
      return res.status(400).json({ error: "O tipo deve ser Sector ou Secção" });
    }
    await sec.update(dados);
    res.json({ dados: sec, message: "Secção actualizada com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.eliminar = async (req, res, next) => {
  try {
    const sec = await Seccao.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!sec) return res.status(404).json({ error: "Secção não encontrada" });
    await sec.destroy();
    res.json({ message: "Secção eliminada com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.membros = async (req, res, next) => {
  try {
    const sec = await Seccao.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
      attributes: ["id"],
    });
    if (!sec) return res.status(404).json({ error: "Secção não encontrada" });

    const membros = await SeccaoMembro.findAll({
      where: { seccao_id: sec.id },
      include: [
        incluirColaboradorDaOrg(req.organizacao_id, ["id", "nome_completo", "numero_colaborador", "email_institucional", "telefone", "fotografia"]),
      ],
      order: [["funcao", "ASC"], ["createdAt", "ASC"]],
    });
    res.json({ dados: membros });
  } catch (e) {
    next(e);
  }
};

exports.adicionarMembro = async (req, res, next) => {
  try {
    const { colaborador_id, funcao } = req.body;
    if (!colaborador_id) {
      return res.status(400).json({ error: "O colaborador é obrigatório" });
    }
    const sec = await Seccao.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!sec) return res.status(404).json({ error: "Secção não encontrada" });

    const colaboradorValido = await colaboradorNaOrg(colaborador_id, req.organizacao_id);
    if (!colaboradorValido) {
      return res.status(404).json({ error: "Colaborador não encontrado nesta organização" });
    }

    const [membro, criado] = await SeccaoMembro.findOrCreate({
      where: { seccao_id: sec.id, colaborador_id },
      defaults: { funcao: funcao || "Membro" },
    });
    if (!criado && funcao) {
      await membro.update({ funcao: funcao });
    }
    res.status(201).json({ dados: membro, message: "Membro adicionado à secção" });
  } catch (e) {
    next(e);
  }
};

exports.removerMembro = async (req, res, next) => {
  try {
    const sec = await Seccao.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
      attributes: ["id"],
    });
    if (!sec) return res.status(404).json({ error: "Secção não encontrada" });

    const membro = await SeccaoMembro.findOne({
      where: { seccao_id: sec.id, colaborador_id: req.params.colaboradorId },
    });
    if (!membro) return res.status(404).json({ error: "Membro não encontrado na secção" });
    await membro.destroy();
    res.json({ message: "Membro removido da secção" });
  } catch (e) {
    next(e);
  }
};
