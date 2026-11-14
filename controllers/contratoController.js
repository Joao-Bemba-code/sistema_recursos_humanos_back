var { Contrato, Colaborador } = require("../models");
var { Op } = require("sequelize");
var { orgDaSessao, incluirColaboradorDaOrg, colaboradorNaOrg } = require("../helpers/organizacao");

exports.listar = async (req, res, next) => {
  try {
    const { page = 1, limit = 15, search = "", tipo = "", estado = "" } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const orgId = orgDaSessao(req);

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
      include: [incluirColaboradorDaOrg(orgId)],
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
    const c = await Contrato.findOne({
      where: { id: req.params.id },
      include: [incluirColaboradorDaOrg(orgDaSessao(req))],
    });
    if (!c) return res.status(404).json({ error: "Contrato não encontrado" });
    res.json({ dados: c });
  } catch (e) {
    next(e);
  }
};

var camposOpcionaisContrato = ["colaborador_id", "numero", "data_fim", "data_assinatura", "periodo_experimentacao", "funcao", "local_trabalho", "horario_trabalho", "motivo_rescisao", "data_rescisao", "observacoes", "documento", "subsidio_alimentacao"];
var camposEnumContrato = ["tipo", "estado"];

exports.criar = async (req, res, next) => {
  try {
    var dados = req.body;
    var chaves = Object.keys(dados);
    for (var i = 0; i < chaves.length; i++) {
      if (dados[chaves[i]] === "" && camposEnumContrato.indexOf(chaves[i]) !== -1) {
        delete dados[chaves[i]];
        continue;
      }
      if (dados[chaves[i]] === "" && camposOpcionaisContrato.indexOf(chaves[i]) !== -1) {
        dados[chaves[i]] = null;
      }
    }
    if (!(await colaboradorNaOrg(dados.colaborador_id, orgDaSessao(req)))) {
      return res.status(404).json({ error: "Colaborador não encontrado nesta organização" });
    }
    const c = await Contrato.create(dados);
    res.status(201).json({ dados: c, message: "Contrato criado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.actualizar = async (req, res, next) => {
  try {
    const c = await Contrato.findOne({
      where: { id: req.params.id },
      include: [incluirColaboradorDaOrg(orgDaSessao(req), ["id"])],
    });
    if (!c) return res.status(404).json({ error: "Contrato não encontrado" });

    if (req.body && req.body.colaborador_id !== undefined &&
        String(req.body.colaborador_id) !== String(c.colaborador_id) &&
        !(await colaboradorNaOrg(req.body.colaborador_id, orgDaSessao(req)))) {
      return res.status(404).json({ error: "Colaborador não encontrado nesta organização" });
    }

    var camposProtegidos = ["id", "createdAt", "updatedAt"];
    var dadosActualizar = {};

    var chaves = Object.keys(req.body);
    for (var i = 0; i < chaves.length; i++) {
      if (camposProtegidos.indexOf(chaves[i]) !== -1) continue;
      var valor = req.body[chaves[i]];
      if (valor === "" && camposEnumContrato.indexOf(chaves[i]) !== -1) continue;
      if (valor === "" && camposOpcionaisContrato.indexOf(chaves[i]) !== -1) { dadosActualizar[chaves[i]] = null; continue; }
      if (valor === undefined) continue;
      dadosActualizar[chaves[i]] = valor;
    }

    await c.update(dadosActualizar);
    res.json({ dados: c, message: "Contrato actualizado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.eliminar = async (req, res, next) => {
  try {
    const c = await Contrato.findOne({
      where: { id: req.params.id },
      include: [incluirColaboradorDaOrg(orgDaSessao(req), ["id"])],
    });
    if (!c) return res.status(404).json({ error: "Contrato não encontrado" });
    await c.destroy();
    res.json({ message: "Contrato eliminado com sucesso" });
  } catch (e) {
    next(e);
  }
};

exports.stats = async (req, res, next) => {
  try {
    // Isolamento: so contam os contratos de colaboradores da organizacao.
    const comOrg = () => [incluirColaboradorDaOrg(orgDaSessao(req), ["id"])];

    const total = await Contrato.count({ include: comOrg() });
    const activos = await Contrato.count({ where: { estado: "Activo" }, include: comOrg() });
    const expirados = await Contrato.count({ where: { estado: "Expirado" }, include: comOrg() });
    const rescindidos = await Contrato.count({ where: { estado: "Rescindido" }, include: comOrg() });

    const por_tipo = await Contrato.findAll({
      attributes: ["tipo", [require("sequelize").fn("COUNT", "Contrato.id"), "total"]],
      include: comOrg(),
      group: ["tipo"],
    });

    res.json({
      dados: { total, activos, expirados, rescindidos, por_tipo },
    });
  } catch (e) {
    next(e);
  }
};
