var { Op } = require("sequelize");
var { Unidade, UnidadeSeccao, Seccao, Departamento, Colaborador } = require("../models");
var { ORG_INEXISTENTE } = require("../helpers/organizacao");

var incluirSeccoes = function () {
  return {
    model: Seccao,
    as: "seccoes",
    attributes: ["id", "nome", "tipo", "departamento_id"],
    through: { attributes: [] },
    include: [{ model: Departamento, as: "departamento", attributes: ["id", "nome"] }],
  };
};

var seccoesDaOrg = async function (ids, organizacaoId) {
  var lista = (Array.isArray(ids) ? ids : []).filter(Boolean);
  if (lista.length === 0) return [];
  return Seccao.findAll({
    where: { id: { [Op.in]: lista }, organizacao_id: organizacaoId },
    attributes: ["id"],
  });
};

exports.listar = async (req, res, next) => {
  try {
    var { page = 1, limit = 50, search = "", seccao_id = "", departamento_id = "", activo = "" } = req.query;
    var pagina = parseInt(page, 10) || 1;
    var limite = parseInt(limit, 10) || 50;
    var offset = (pagina - 1) * limite;

    var organizacaoId = req.organizacao_id || ORG_INEXISTENTE;
    var where = { organizacao_id: organizacaoId };
    if (search) {
      where[Op.or] = [
        { nome: { [Op.like]: "%" + search + "%" } },
        { codigo: { [Op.like]: "%" + search + "%" } },
        { responsavel_nome: { [Op.like]: "%" + search + "%" } },
      ];
    }
    if (activo === "true") where.activo = true;
    if (activo === "false") where.activo = false;

    var vazio = {
      dados: [],
      paginacao: { total: 0, pagina: pagina, limite: limite, total_paginas: 0 },
    };

    if (seccao_id || departamento_id) {
      var seccaoWhere = { organizacao_id: organizacaoId };
      if (seccao_id) seccaoWhere.id = seccao_id;
      if (departamento_id) seccaoWhere.departamento_id = departamento_id;

      var seccoesFiltro = await Seccao.findAll({ where: seccaoWhere, attributes: ["id"] });
      if (seccoesFiltro.length === 0) return res.json(vazio);

      var ligacoes = await UnidadeSeccao.findAll({
        where: { seccao_id: { [Op.in]: seccoesFiltro.map(function (s) { return s.id; }) } },
        attributes: ["unidade_id"],
      });
      var idsUnidade = [];
      ligacoes.forEach(function (l) {
        if (l.unidade_id && idsUnidade.indexOf(l.unidade_id) === -1) idsUnidade.push(l.unidade_id);
      });
      if (idsUnidade.length === 0) return res.json(vazio);

      where.id = { [Op.in]: idsUnidade };
    }

    var total = await Unidade.count({ where: where });
    var linhas = await Unidade.findAll({
      where: where,
      include: [incluirSeccoes()],
      order: [["nome", "ASC"]],
      limit: limite,
      offset: offset,
    });

    return res.json({
      dados: linhas,
      paginacao: {
        total: total,
        pagina: pagina,
        limite: limite,
        total_paginas: Math.ceil(total / limite),
      },
    });
  } catch (e) {
    next(e);
  }
};

exports.obter = async (req, res, next) => {
  try {
    var unidade = await Unidade.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
      include: [incluirSeccoes()],
    });
    if (!unidade) return res.status(404).json({ error: "Unidade não encontrada" });
    return res.json({ dados: unidade });
  } catch (e) {
    next(e);
  }
};

exports.criar = async (req, res, next) => {
  try {
    if (!req.organizacao_id) {
      return res.status(403).json({ error: "Conta sem organizacao associada" });
    }
    var dados = req.body || {};
    var nome = String(dados.nome || "").trim();
    if (!nome) return res.status(400).json({ error: "O nome da unidade é obrigatório" });

    var ids = Array.isArray(dados.seccao_ids) ? dados.seccao_ids : [];
    var seccoes = await seccoesDaOrg(ids, req.organizacao_id);
    if (seccoes.length === 0) {
      return res.status(400).json({ error: "Escolha pelo menos um sector/secção para a unidade" });
    }

    var unidade = await Unidade.create({
      organizacao_id: req.organizacao_id,
      nome: nome,
      codigo: dados.codigo || null,
      descricao: dados.descricao || null,
      responsavel_nome: dados.responsavel_nome || null,
      telefone: dados.telefone || null,
      email: dados.email || null,
      activo: dados.activo !== false,
    });

    await unidade.setSeccoes(seccoes.map(function (s) { return s.id; }));

    var criada = await Unidade.findByPk(unidade.id, { include: [incluirSeccoes()] });
    return res.status(201).json({ dados: criada, message: "Unidade criada com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.actualizar = async (req, res, next) => {
  try {
    var unidade = await Unidade.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!unidade) return res.status(404).json({ error: "Unidade não encontrada" });

    var dados = req.body || {};
    var campos = ["nome", "codigo", "descricao", "responsavel_nome", "telefone", "email", "activo"];
    var alteracoes = {};
    campos.forEach(function (campo) {
      if (dados[campo] !== undefined) alteracoes[campo] = dados[campo];
    });
    if (alteracoes.nome !== undefined && !String(alteracoes.nome).trim()) {
      return res.status(400).json({ error: "O nome da unidade é obrigatório" });
    }

    if (Array.isArray(dados.seccao_ids)) {
      var seccoes = await seccoesDaOrg(dados.seccao_ids, req.organizacao_id);
      if (seccoes.length === 0) {
        return res.status(400).json({ error: "Escolha pelo menos um sector/secção para a unidade" });
      }
      await unidade.setSeccoes(seccoes.map(function (s) { return s.id; }));
    }

    await unidade.update(alteracoes);

    var actualizada = await Unidade.findByPk(unidade.id, { include: [incluirSeccoes()] });
    return res.json({ dados: actualizada, message: "Unidade actualizada com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.eliminar = async (req, res, next) => {
  try {
    var unidade = await Unidade.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!unidade) return res.status(404).json({ error: "Unidade não encontrada" });

    var total = await Colaborador.count({ where: { unidade_id: unidade.id } });
    if (total > 0) {
      return res.status(400).json({ error: "Esta unidade tem colaboradores associados. Mova-os primeiro." });
    }

    await UnidadeSeccao.destroy({ where: { unidade_id: unidade.id } });
    await unidade.destroy();
    return res.json({ message: "Unidade eliminada com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.colaboradores = async (req, res, next) => {
  try {
    var unidade = await Unidade.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
      attributes: ["id", "nome"],
    });
    if (!unidade) return res.status(404).json({ error: "Unidade não encontrada" });

    var lista = await Colaborador.findAll({
      where: { unidade_id: unidade.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
      attributes: ["id", "nome_completo", "numero_colaborador", "estado", "email_institucional"],
      order: [["nome_completo", "ASC"]],
    });
    return res.json({ dados: lista, unidade: unidade });
  } catch (e) {
    next(e);
  }
};

exports.adicionarColaborador = async (req, res, next) => {
  try {
    var unidade = await Unidade.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!unidade) return res.status(404).json({ error: "Unidade não encontrada" });

    var colaborador = await Colaborador.findOne({
      where: { id: req.body.colaborador_id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!colaborador) return res.status(404).json({ error: "Colaborador não encontrado" });

    await colaborador.update({ unidade_id: unidade.id });
    return res.json({ message: "Colaborador associado à unidade", dados: colaborador });
  } catch (e) {
    next(e);
  }
};

exports.removerColaborador = async (req, res, next) => {
  try {
    var unidade = await Unidade.findOne({
      where: { id: req.params.id, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
    });
    if (!unidade) return res.status(404).json({ error: "Unidade não encontrada" });

    var colaborador = await Colaborador.findOne({
      where: {
        id: req.params.colaboradorId,
        unidade_id: unidade.id,
        organizacao_id: req.organizacao_id || ORG_INEXISTENTE,
      },
    });
    if (!colaborador) return res.status(404).json({ error: "Colaborador não pertence a esta unidade" });

    await colaborador.update({ unidade_id: null });
    return res.json({ message: "Colaborador removido da unidade" });
  } catch (e) {
    next(e);
  }
};
