var { Op } = require("sequelize");
var { RegistoPresenca, Colaborador } = require("../models");

// Valores aceitos pela coluna ENUM no MySQL (sem acentos).
var ESTADOS_VALIDOS = ["Presente", "Ausente", "Atrasado", "Licenca", "Ferias", "Fim_semana", "Em_Curso"];
var METODOS_VALIDOS = ["Manual", "Biometrico", "GPS", "QR_Code"];

// Campos que o utilizador pode gravar (o resto e interno: processada, ajustado_manual...)
var CAMPOS_EDITAVEIS = [
  "colaborador_id", "data", "hora_entrada", "hora_saida", "estado", "metodo", "observacoes",
  "justificado", "justificacao_observacoes", "documento_justificacao",
];

// Chave de comparacao: minusculas, sem acentos, so [a-z0-9_]
var canonico = function (valor) {
  return String(valor).trim().toLowerCase()
    .replace(/ç/g, "c")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
};

var VARIANTES_ESTADO = {
  presente: "Presente", ausente: "Ausente", atrasado: "Atrasado",
  licenca: "Licenca", ferias: "Ferias", fim_de_semana: "Fim_semana",
  em_curso: "Em_Curso",
};
var VARIANTES_METODO = {
  manual: "Manual", biometrico: "Biometrico", gps: "GPS", qr_code: "QR_Code",
};

// O frontend e outros clientes podem enviar os valores com acentos ou espacos
// ("Licença", "Férias", "Biométrico", "QR Code", "Fim de semana"). Traduz para o
// valor exacto do ENUM, para a gravacao nunca falhar por causa de acentos.
var normalizarEstado = function (valor) {
  if (valor === undefined || valor === null || valor === "") return valor;
  return VARIANTES_ESTADO[canonico(valor)] || String(valor).trim();
};

var normalizarMetodo = function (valor) {
  if (valor === undefined || valor === null || valor === "") return valor;
  return VARIANTES_METODO[canonico(valor)] || String(valor).trim();
};

// Valida (e corrige acentos) o estado/metodo; devolve mensagem de erro ou null
var validarEnum = function (estado, metodo) {
  if (estado !== undefined && estado !== null && ESTADOS_VALIDOS.indexOf(estado) === -1) {
    return "Estado invalido. Valores aceites: " + ESTADOS_VALIDOS.join(", ");
  }
  if (metodo !== undefined && metodo !== null && METODOS_VALIDOS.indexOf(metodo) === -1) {
    return "Metodo de registo invalido. Valores aceites: " + METODOS_VALIDOS.join(", ");
  }
  return null;
};

// Calcula horas trabalhadas/extras a partir da entrada e saida (HH:MM[:SS])
var calcularHoras = function (horaEntrada, horaSaida) {
  if (!horaEntrada || !horaSaida) return { horas_trabalhadas: null, horas_extras: 0 };
  var entrada = new Date("1970-01-01T" + horaEntrada);
  var saida = new Date("1970-01-01T" + horaSaida);
  if (isNaN(entrada.getTime()) || isNaN(saida.getTime())) return { horas_trabalhadas: null, horas_extras: 0 };
  var diff = (saida - entrada) / (1000 * 60 * 60);
  if (diff < 0) diff += 24;
  return {
    horas_trabalhadas: Math.round(diff * 100) / 100,
    horas_extras: diff > 8 ? Math.round((diff - 8) * 100) / 100 : 0,
  };
};

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
      var colabsEncontrados = await Colaborador.findAll({
        where: {
          [Op.or]: [
            { nome_completo: { [Op.like]: "%" + search + "%" } },
            { numero_colaborador: { [Op.like]: "%" + search + "%" } },
          ],
        },
        attributes: ["id"],
      });
      var idsColabs = colabsEncontrados.map(function (c) { return c.id; });
      var ou = [{ observacoes: { [Op.like]: "%" + search + "%" } }];
      if (idsColabs.length > 0) {
        ou.push({ colaborador_id: { [Op.in]: idsColabs } });
      }
      where[Op.or] = ou;
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
    var corpo = req.body || {};

    if (!corpo.colaborador_id || !corpo.data) {
      return res.status(400).json({ error: "colaborador_id e data sao obrigatorios" });
    }

    // So aceita os campos de assiduidade (evita gravar campos internos por engano)
    var dados = {};
    CAMPOS_EDITAVEIS.forEach(function (campo) {
      if (corpo[campo] !== undefined) dados[campo] = corpo[campo];
    });

    // Normaliza/valida os ENUM (aceita "Licença"/"Biométrico" e escreve "Licenca"/"Biometrico")
    if (dados.estado !== undefined && dados.estado !== null) dados.estado = normalizarEstado(dados.estado);
    if (dados.metodo !== undefined && dados.metodo !== null) dados.metodo = normalizarMetodo(dados.metodo);
    var erroEnum = validarEnum(dados.estado, dados.metodo);
    if (erroEnum) return res.status(400).json({ error: erroEnum });

    var horas = calcularHoras(dados.hora_entrada, dados.hora_saida);
    dados.horas_trabalhadas = horas.horas_trabalhadas;
    dados.horas_extras = horas.horas_extras;

    // Registo criado a mao (correccao do RH, ex.: esqueceu-se o dedo no biometro):
    // fica protegido para a ponte do biometro nao o voltar a mexer.
    if (!dados.metodo || dados.metodo === "Manual") dados.ajustado_manual = true;

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

    var keys = Object.keys(req.body || {});
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    if (dadosActualizar.estado !== undefined && dadosActualizar.estado !== null) {
      dadosActualizar.estado = normalizarEstado(dadosActualizar.estado);
    }
    if (dadosActualizar.metodo !== undefined && dadosActualizar.metodo !== null) {
      dadosActualizar.metodo = normalizarMetodo(dadosActualizar.metodo);
    }
    var erroEnum = validarEnum(dadosActualizar.estado, dadosActualizar.metodo);
    if (erroEnum) return res.status(400).json({ error: erroEnum });

    var horaEntrada = dadosActualizar.hora_entrada !== undefined ? dadosActualizar.hora_entrada : registo.hora_entrada;
    var horaSaida = dadosActualizar.hora_saida !== undefined ? dadosActualizar.hora_saida : registo.hora_saida;
    if (horaEntrada || horaSaida) {
      var horas = calcularHoras(horaEntrada, horaSaida);
      dadosActualizar.horas_trabalhadas = horas.horas_trabalhadas;
      if (horaEntrada && horaSaida) dadosActualizar.horas_extras = horas.horas_extras;
    }

    // Edicao pelo RH = ajuste manual: a partir de agora o biometro nao altera
    // este registo (ex.: o colaborador esqueceu-se de meter o dedo e o RH
    // preencheu a entrada a mao, ou marcou Presente em vez de Ausente).
    dadosActualizar.ajustado_manual = true;

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
    console.log("Erro ao actualizar registo de presenca:", e.message);
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
