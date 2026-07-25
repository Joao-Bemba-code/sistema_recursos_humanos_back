var { Op } = require("sequelize");
var path = require("path");
var fs = require("fs");
var { sequelize, RegistoPresenca, Colaborador, Vencimento } = require("../models");

var resumo = async function (req, res) {
  try {
    var org_id = req.utilizador.organizacao_id;
    var data_inicio = req.query.data_inicio;
    var data_fim = req.query.data_fim;
    var colaborador_id = req.query.colaborador_id;

    var where = {
      estado: { [Op.in]: ["Ausente", "Atrasado"] },
    };
    if (data_inicio && data_fim) {
      where.data = { [Op.between]: [data_inicio, data_fim] };
    } else if (data_inicio) {
      where.data = { [Op.gte]: data_inicio };
    } else if (data_fim) {
      where.data = { [Op.lte]: data_fim };
    }
    if (colaborador_id) where.colaborador_id = colaborador_id;

    var faltas = await RegistoPresenca.findAll({
      where: Object.assign({}, where, { estado: "Ausente" }),
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id"], where: { organizacao_id: org_id } },
      ],
      attributes: ["id", "data", "observacoes", "justificado", "documento_justificacao", "justificacao_observacoes"],
      order: [["data", "DESC"]],
    });

    var atrasos = await RegistoPresenca.findAll({
      where: Object.assign({}, where, { estado: "Atrasado" }),
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id"], where: { organizacao_id: org_id } },
      ],
      attributes: ["id", "data", "hora_entrada", "hora_saida", "horas_trabalhadas", "observacoes", "justificado", "documento_justificacao", "justificacao_observacoes"],
      order: [["data", "DESC"]],
    });

    var colaboradores = await Colaborador.findAll({
      where: { organizacao_id: org_id, estado: "Activo" },
      attributes: ["id", "nome_completo", "numero_colaborador"],
    });

    var resumoColab = {};
    colaboradores.forEach(function (c) {
      resumoColab[c.id] = {
        colaborador_id: c.id,
        nome_completo: c.nome_completo,
        numero_colaborador: c.numero_colaborador,
        total_faltas: 0,
        total_faltas_justificadas: 0,
        total_atrasos: 0,
        total_atrasos_justificados: 0,
        minutos_atraso_total: 0,
        horas_descontar: 0,
        horas_descontar_efectivo: 0,
        desconto_previsto: 0,
        faltas_detalhe: [],
        atrasos_detalhe: [],
      };
    });

    faltas.forEach(function (f) {
      var cid = f.colaborador.id;
      if (!resumoColab[cid]) return;
      resumoColab[cid].total_faltas++;
      var justificado = f.justificado || false;
      if (justificado) {
        resumoColab[cid].total_faltas_justificadas++;
      } else {
        resumoColab[cid].horas_descontar += 8;
        resumoColab[cid].horas_descontar_efectivo += 8;
      }
      resumoColab[cid].faltas_detalhe.push({
        id: f.id,
        data: f.data,
        observacoes: f.observacoes,
        justificado: justificado,
        documento_justificacao: f.documento_justificacao,
        justificacao_observacoes: f.justificacao_observacoes,
      });
    });

    atrasos.forEach(function (a) {
      var cid = a.colaborador.id;
      if (!resumoColab[cid]) return;
      resumoColab[cid].total_atrasos++;
      var mins = 0;
      if (a.hora_entrada) {
        var partes = a.hora_entrada.split(":");
        var minsEntrada = parseInt(partes[0]) * 60 + parseInt(partes[1]);
        var minsNormais = 8 * 60;
        if (minsEntrada > minsNormais) {
          mins = minsEntrada - minsNormais;
        }
      }
      resumoColab[cid].minutos_atraso_total += mins;
      var horasAtraso = Math.round((mins / 60) * 100) / 100;
      var justificado = a.justificado || false;
      if (!justificado) {
        resumoColab[cid].horas_descontar += horasAtraso;
        resumoColab[cid].horas_descontar_efectivo += horasAtraso;
      }
      if (justificado) {
        resumoColab[cid].total_atrasos_justificados++;
      }
      resumoColab[cid].atrasos_detalhe.push({
        id: a.id,
        data: a.data,
        hora_entrada: a.hora_entrada,
        minutos: mins,
        observacoes: a.observacoes,
        justificado: justificado,
        documento_justificacao: a.documento_justificacao,
        justificacao_observacoes: a.justificacao_observacoes,
      });
    });

    var colaboradorIds = Object.keys(resumoColab);
    if (colaboradorIds.length > 0) {
      var placeholders = colaboradorIds.map(function() { return "?"; }).join(",");
      var vencResult = await sequelize.query(
        "SELECT colaborador_id, salario_base FROM contratos WHERE colaborador_id IN (" + placeholders + ") AND estado = 'Activo' ORDER BY createdAt DESC",
        { replacements: colaboradorIds, type: sequelize.QueryTypes.SELECT }
      );

      var vencPorColab = {};
      vencResult.forEach(function (v) {
        if (v.colaborador_id && resumoColab[v.colaborador_id] && !vencPorColab[v.colaborador_id]) {
          vencPorColab[v.colaborador_id] = v;
        }
      });

      Object.keys(vencPorColab).forEach(function (cid) {
        var v = vencPorColab[cid];
        var salarioDiario = parseFloat(v.salario_base) / 30;
        var salarioHora = salarioDiario / 8;
        resumoColab[cid].salario_hora = salarioHora;
        resumoColab[cid].desconto_previsto = Math.round(resumoColab[cid].horas_descontar_efectivo * salarioHora * 100) / 100;
      });
    }

    var lista = Object.values(resumoColab);
    var totalGeralFaltas = 0;
    var totalGeralAtrasos = 0;
    var totalGeralDesconto = 0;
    lista.forEach(function (r) {
      totalGeralFaltas += r.total_faltas;
      totalGeralAtrasos += r.total_atrasos;
      totalGeralDesconto += r.desconto_previsto;
    });

    return res.status(200).json({
      dados: {
        colaboradores: lista,
        totais: {
          total_faltas: totalGeralFaltas,
          total_atrasos: totalGeralAtrasos,
          total_desconto: Math.round(totalGeralDesconto * 100) / 100,
        },
      },
    });
  } catch (e) {
    console.log("Erro ao gerar resumo de faltas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var registros = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var data_inicio = req.query.data_inicio;
    var data_fim = req.query.data_fim;
    var tipo = req.query.tipo;
    var colaborador_id = req.query.colaborador_id;

    var where = {};
    if (tipo === "faltas") {
      where.estado = "Ausente";
    } else if (tipo === "atrasos") {
      where.estado = "Atrasado";
    } else {
      where.estado = { [Op.in]: ["Ausente", "Atrasado"] };
    }
    if (data_inicio && data_fim) {
      where.data = { [Op.between]: [data_inicio, data_fim] };
    } else if (data_inicio) {
      where.data = { [Op.gte]: data_inicio };
    } else if (data_fim) {
      where.data = { [Op.lte]: data_fim };
    }
    if (colaborador_id) where.colaborador_id = colaborador_id;

    var org_id = req.utilizador.organizacao_id;

    var { count, rows } = await RegistoPresenca.findAndCountAll({
      where: where,
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"], where: { organizacao_id: org_id } },
      ],
      attributes: ["id", "data", "estado", "hora_entrada", "hora_saida", "horas_trabalhadas", "observacoes", "justificado", "documento_justificacao", "justificacao_observacoes"],
      order: [["data", "DESC"]],
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
    console.log("Erro ao listar registros de faltas/atrasos:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var justificar = async function (req, res) {
  try {
    var { id } = req.params;
    var { justificacao_observacoes } = req.body;

    var registo = await RegistoPresenca.findByPk(id);
    if (!registo) {
      return res.status(404).json({ error: "Registo nao encontrado" });
    }

    if (registo.estado !== "Ausente" && registo.estado !== "Atrasado") {
      return res.status(400).json({ error: "Apenas faltas e atrasos podem ser justificados" });
    }

    var updateData = {
      justificado: true,
      justificacao_observacoes: justificacao_observacoes || null,
    };

    if (req.files && req.files.documento) {
      var doc = req.files.documento;
      var ext = path.extname(doc.name) || ".pdf";
      var filename = "justificacao_" + id + "_" + Date.now() + ext;
      var uploadDir = path.join(__dirname, "..", "uploads", "justificacoes");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      var caminho = path.join(uploadDir, filename);
      await doc.mv(caminho);
      updateData.documento_justificacao = "/uploads/justificacoes/" + filename;
    }

    await registo.update(updateData);

    return res.status(200).json({
      mensagem: "Falta justificada com sucesso",
      dados: registo,
    });
  } catch (e) {
    console.log("Erro ao justificar falta:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var removerJustificacao = async function (req, res) {
  try {
    var { id } = req.params;

    var registo = await RegistoPresenca.findByPk(id);
    if (!registo) {
      return res.status(404).json({ error: "Registo nao encontrado" });
    }

    if (!registo.justificado) {
      return res.status(400).json({ error: "Este registo nao possui justificacao" });
    }

    if (registo.documento_justificacao) {
      var caminhoAntigo = path.join(__dirname, "..", registo.documento_justificacao);
      if (fs.existsSync(caminhoAntigo)) {
        fs.unlinkSync(caminhoAntigo);
      }
    }

    await registo.update({
      justificado: false,
      documento_justificacao: null,
      justificacao_observacoes: null,
    });

    return res.status(200).json({
      mensagem: "Justificacao removida com sucesso",
      dados: registo,
    });
  } catch (e) {
    console.log("Erro ao remover justificacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var eliminar = async function (req, res) {
  try {
    var { id } = req.params;

    var registo = await RegistoPresenca.findByPk(id);
    if (!registo) {
      return res.status(404).json({ error: "Registo nao encontrado" });
    }

    await registo.destroy();

    return res.status(200).json({
      mensagem: "Falta eliminada com sucesso",
    });
  } catch (e) {
    console.log("Erro ao eliminar falta:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { resumo, registros, justificar, removerJustificacao, eliminar };
