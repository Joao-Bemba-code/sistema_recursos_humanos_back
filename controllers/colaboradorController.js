var { Op } = require("sequelize");
var { Colaborador, Departamento, Cargo, Utilizador, Contrato, Ferias, SolicitacaoFerias, Licenca, RegistoPresenca, AvaliacaoDesempenho, InscricaoFormacao, OcorrenciaDisciplinar, Vencimento, Pagamento, PedidoColaborador } = require("../models");

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 20;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var departamento_id = req.query.departamento_id;
    var tipo = req.query.tipo_colaborador;

    var where = {};
    if (req.organizacao_id) {
      where.organizacao_id = req.organizacao_id;
    }

    if (search) {
      where[Op.or] = [
        { nome_completo: { [Op.like]: "%" + search + "%" } },
        { numero_colaborador: { [Op.like]: "%" + search + "%" } },
        { nif: { [Op.like]: "%" + search + "%" } },
        { email_pessoal: { [Op.like]: "%" + search + "%" } },
      ];
    }

    if (estado) {
      where.estado = estado;
    } else {
      where.estado = { [Op.ne]: "Desligado" };
    }
    if (departamento_id) where.departamento_id = departamento_id;
    if (tipo) where.tipo_colaborador = tipo;

    var { count, rows } = await Colaborador.findAndCountAll({
      where: where,
      include: [
        { model: Departamento, as: "departamento", attributes: ["id", "nome"] },
        { model: Cargo, as: "cargo", attributes: ["id", "nome"] },
      ],
      order: [["nome_completo", "ASC"]],
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
    console.log("Erro ao listar colaboradores:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getById = async function (req, res) {
  try {
    var colaborador = await Colaborador.findByPk(req.params.id, {
      include: [
        { model: Departamento, as: "departamento" },
        { model: Cargo, as: "cargo" },
        { model: Utilizador, as: "utilizador", attributes: ["id", "email", "username"] },
      ],
    });

    if (!colaborador) {
      return res.status(404).json({ error: "Colaborador não encontrado" });
    }

    return res.status(200).json({ dados: colaborador });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var generateNumero = async function (organizacao_id) {
  var maxColab = await Colaborador.findOne({
    where: { organizacao_id: organizacao_id },
    attributes: ["numero_colaborador"],
    order: [["numero_colaborador", "DESC"]],
  });
  var ultimo = 0;
  if (maxColab && maxColab.numero_colaborador) {
    var match = String(maxColab.numero_colaborador).match(/(\d+)$/);
    if (match) ultimo = parseInt(match[1], 10);
  }
  var num = ultimo + 1;
  return "COL-" + String(num).padStart(5, "0");
};

var create = async function (req, res) {
  try {
    var dados = req.body;
    dados.organizacao_id = req.organizacao_id;

    var camposOpcionais = ["nome_completo", "nome_curto", "data_nascimento", "genero", "estado_civil", "nif", "bi", "bi_validade", "email_pessoal", "email_institucional", "telefone", "telefone_emergencia", "endereco", "cidade", "provincia", "fotografia", "numero_seguranca_social", "conta_bancaria", "banco", "iban", "habilitacoes", "formacao_academica", "curriculo", "utilizador_id", "data_desligamento", "motivo_desligamento", "observacoes"];
    var chaves = Object.keys(dados);
    for (var i = 0; i < chaves.length; i++) {
      if (dados[chaves[i]] === "" && camposOpcionais.indexOf(chaves[i]) !== -1) {
        dados[chaves[i]] = null;
      }
    }

    if (!dados.numero_colaborador) {
      dados.numero_colaborador = await generateNumero(req.organizacao_id);
    }

    var colaborador = await Colaborador.create(dados);

    return res.status(201).json({
      mensagem: "Colaborador criado com sucesso",
      dados: colaborador,
    });
  } catch (e) {
    console.log("Erro ao criar colaborador:", e.message);
    if (e.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Número de colaborador já existe" });
    }
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var update = async function (req, res) {
  try {
    var colaborador = await Colaborador.findByPk(req.params.id);
    if (!colaborador) {
      return res.status(404).json({ error: "Colaborador não encontrado" });
    }

    var camposProtegidos = ["id", "organizacao_id", "numero_colaborador", "createdAt", "updatedAt"];
    var camposEnum = ["genero", "estado_civil", "tipo_colaborador", "estado"];
    var camposData = ["data_nascimento", "bi_validade", "data_admissao", "data_desligamento"];
    var camposOpcionais = ["nome_completo", "nome_curto", "data_nascimento", "genero", "estado_civil", "nif", "bi", "bi_validade", "email_pessoal", "email_institucional", "telefone", "telefone_emergencia", "endereco", "cidade", "provincia", "fotografia", "numero_seguranca_social", "conta_bancaria", "banco", "iban", "habilitacoes", "formacao_academica", "curriculo", "utilizador_id", "data_desligamento", "motivo_desligamento", "observacoes"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) !== -1) continue;
      var valor = req.body[keys[i]];
      if (valor === "" && camposEnum.indexOf(keys[i]) !== -1) continue;
      if (valor === "" && camposOpcionais.indexOf(keys[i]) !== -1) { dadosActualizar[keys[i]] = null; continue; }
      if (valor === undefined) continue;
      dadosActualizar[keys[i]] = valor;
    }

    await colaborador.update(dadosActualizar);

    var actualizado = await Colaborador.findByPk(req.params.id, {
      include: [
        { model: Departamento, as: "departamento" },
        { model: Cargo, as: "cargo" },
      ],
    });

    return res.status(200).json({
      mensagem: "Colaborador actualizado com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    console.log("Erro ao actualizar colaborador:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor", detalhe: e.message });
  }
};

var updateStatus = async function (req, res) {
  try {
    var colaborador = await Colaborador.findByPk(req.params.id);
    if (!colaborador) {
      return res.status(404).json({ error: "Colaborador não encontrado" });
    }

    var estadosValidos = ["Activo", "Inactivo", "Suspenso", "Aposentado", "Desligado"];
    var { estado } = req.body;

    if (!estado || estadosValidos.indexOf(estado) === -1) {
      return res.status(400).json({ error: "Estado inválido. Valores permitidos: " + estadosValidos.join(", ") });
    }

    await colaborador.update({ estado: estado });

    var actualizado = await Colaborador.findByPk(req.params.id, {
      include: [
        { model: Departamento, as: "departamento", attributes: ["id", "nome"] },
        { model: Cargo, as: "cargo", attributes: ["id", "nome"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Estado do colaborador actualizado com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var remove = async function (req, res) {
  try {
    var colaborador = await Colaborador.findByPk(req.params.id);
    if (!colaborador) {
      return res.status(404).json({ error: "Colaborador não encontrado" });
    }

    var modelosDependentes = [
      Contrato, Ferias, SolicitacaoFerias, Licenca, RegistoPresenca,
      AvaliacaoDesempenho, InscricaoFormacao, OcorrenciaDisciplinar,
      Vencimento, Pagamento, PedidoColaborador,
    ];

    for (var i = 0; i < modelosDependentes.length; i++) {
      var Modelo = modelosDependentes[i];
      if (!Modelo) continue;
      try {
        await Modelo.destroy({ where: { colaborador_id: colaborador.id } });
      } catch (depErr) {
        console.log("Aviso: nao foi possivel apagar registos de " + Modelo.name + ":", depErr.message);
      }
    }

    await colaborador.destroy();

    return res.status(200).json({ mensagem: "Colaborador eliminado com sucesso" });
  } catch (e) {
    console.log("Erro ao eliminar colaborador:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var stats = async function (req, res) {
  try {
    var orgFilter = "";
    var params = [];
    if (req.organizacao_id) {
      orgFilter = " AND organizacao_id = ?";
      params.push(req.organizacao_id);
    }

    var sql = "SELECT " +
      "COUNT(*) AS total, " +
      "SUM(CASE WHEN estado = 'Activo' THEN 1 ELSE 0 END) AS activos, " +
      "SUM(CASE WHEN tipo_colaborador = 'Interno' AND estado = 'Activo' THEN 1 ELSE 0 END) AS internos, " +
      "SUM(CASE WHEN tipo_colaborador = 'Externo' AND estado = 'Activo' THEN 1 ELSE 0 END) AS externos, " +
      "SUM(CASE WHEN tipo_colaborador = 'Formador_Interno' AND estado = 'Activo' THEN 1 ELSE 0 END) AS formadores_internos, " +
      "SUM(CASE WHEN tipo_colaborador = 'Formador_Externo' AND estado = 'Activo' THEN 1 ELSE 0 END) AS formadores_externos " +
      "FROM colaboradores WHERE 1=1" + orgFilter;

    var [result] = await Colaborador.sequelize.query(sql, { replacements: params });

    var row = result[0] || {};
    var total = parseInt(row.total) || 0;
    var activos = parseInt(row.activos) || 0;

    return res.status(200).json({
      dados: {
        total: total,
        activos: activos,
        inactivos: total - activos,
        internos: parseInt(row.internos) || 0,
        externos: parseInt(row.externos) || 0,
        formadores_internos: parseInt(row.formadores_internos) || 0,
        formadores_externos: parseInt(row.formadores_externos) || 0,
      },
    });
  } catch (e) {
    console.log("Erro no stats:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { list, getById, create, update, updateStatus, remove, stats };
