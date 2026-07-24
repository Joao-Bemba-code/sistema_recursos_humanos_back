var { Op, fn, col, literal } = require("sequelize");
var { RegistoPresenca, Colaborador, Vencimento } = require("../models");

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
      attributes: ["id", "data", "observacoes"],
      order: [["data", "DESC"]],
    });

    var atrasos = await RegistoPresenca.findAll({
      where: Object.assign({}, where, { estado: "Atrasado" }),
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id"], where: { organizacao_id: org_id } },
      ],
      attributes: ["id", "data", "hora_entrada", "hora_saida", "horas_trabalhadas", "observacoes"],
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
        total_atrasos: 0,
        minutos_atraso_total: 0,
        horas_descontar: 0,
        desconto_previsto: 0,
        faltas_detalhe: [],
        atrasos_detalhe: [],
      };
    });

    faltas.forEach(function (f) {
      var cid = f.colaborador.id;
      if (!resumoColab[cid]) return;
      resumoColab[cid].total_faltas++;
      resumoColab[cid].horas_descontar += 8;
      resumoColab[cid].faltas_detalhe.push({ data: f.data, observacoes: f.observacoes });
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
      resumoColab[cid].horas_descontar += horasAtraso;
      resumoColab[cid].atrasos_detalhe.push({ data: a.data, hora_entrada: a.hora_entrada, minutos: mins, observacoes: a.observacoes });
    });

    var colaboradorIds = Object.keys(resumoColab);
    if (colaboradorIds.length > 0) {
      var vencimentos = await Vencimento.findAll({
        where: {
          colaborador_id: { [Op.in]: colaboradorIds },
          estado: "Activo",
        },
        attributes: ["colaborador_id", "salario_base"],
      });
      vencimentos.forEach(function (v) {
        if (resumoColab[v.colaborador_id]) {
          var salarioDiario = parseFloat(v.salario_base) / 30;
          var salarioHora = salarioDiario / 8;
          resumoColab[v.colaborador_id].desconto_previsto = Math.round(resumoColab[v.colaborador_id].horas_descontar * salarioHora * 100) / 100;
        }
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

module.exports = { resumo, registros };
