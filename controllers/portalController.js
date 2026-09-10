var { Colaborador, Ferias, SolicitacaoFerias, AvaliacaoDesempenho, CicloAvaliacao, PedidoColaborador, RegistoPresenca, Contrato, Pagamento } = require("../models");
var { Op, Sequelize } = require("sequelize");

var formatarDataLocal = function (d) {
  var ano = d.getFullYear();
  var mes = String(d.getMonth() + 1).padStart(2, "0");
  var dia = String(d.getDate()).padStart(2, "0");
  return ano + "-" + mes + "-" + dia;
};

var normalizarData = function (s) {
  if (!s) return null;
  var texto = String(s).trim();
  var m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  }
  var m2 = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    return m2[3] + "-" + m2[2].padStart(2, "0") + "-" + m2[1].padStart(2, "0");
  }
  var d = new Date(texto + "T00:00:00");
  return isNaN(d.getTime()) ? null : formatarDataLocal(d);
};

var calcularDescontoEstimado = async function (colaborador_id) {
  try {
    var faltas = await RegistoPresenca.findAll({
      where: {
        colaborador_id: colaborador_id,
        estado: { [Op.in]: ["Ausente", "Atrasado"] },
        justificado: false,
      },
      attributes: ["data", "estado", "hora_entrada"],
    });

    if (faltas.length === 0) {
      return { faltas_mes: 0, atrasos_mes: 0, horas_descontar: 0, valor: 0, salario_diario: 0, salario_hora: 0, salario_base: 0 };
    }

    var mesesFaltas = {};
    faltas.forEach(function (f) {
      var data = String(f.data || "");
      var mes = parseInt(data.substring(5, 7), 10);
      var ano = parseInt(data.substring(0, 4), 10);
      if (mes && ano) mesesFaltas[colaborador_id + "|" + mes + "|" + ano] = { mes: mes, ano: ano };
    });
    var pares = Object.values(mesesFaltas);
    var processados = new Set();
    if (pares.length > 0) {
      var pagamentos = await Pagamento.findAll({
        where: {
          colaborador_id: colaborador_id,
          [Op.or]: pares.map(function (p) {
            return { mes: p.mes, ano: p.ano };
          }),
        },
        attributes: ["mes", "ano"],
      });
      pagamentos.forEach(function (p) {
        processados.add(colaborador_id + "|" + p.mes + "|" + p.ano);
      });
    }

    var contrato = await Contrato.findOne({ where: { colaborador_id: colaborador_id, estado: "Activo" } });
    if (!contrato) {
      contrato = await Contrato.findOne({ where: { colaborador_id: colaborador_id }, order: [["createdAt", "DESC"]] });
    }
    if (!contrato) {
      return { faltas_mes: 0, horas_descontar: 0, valor: 0, salario_diario: 0 };
    }

    var salarioBase = parseFloat(contrato.salario_base) || 0;
    var salarioDiario = salarioBase / 30;
    var salarioHora = salarioDiario / 8;
    var horasDescontar = 0;
    var nFaltas = 0;
    var nAtrasos = 0;

    faltas.forEach(function (f) {
      var data = String(f.data || "");
      var mes = parseInt(data.substring(5, 7), 10);
      var ano = parseInt(data.substring(0, 4), 10);
      if (processados.has(colaborador_id + "|" + mes + "|" + ano)) return;
      if (f.estado === "Ausente") {
        horasDescontar += 8;
        nFaltas++;
      } else if (f.estado === "Atrasado") {
        nAtrasos++;
        if (f.hora_entrada) {
          var partes = f.hora_entrada.split(":");
          var minsEntrada = parseInt(partes[0]) * 60 + parseInt(partes[1]);
          var minsNormais = 8 * 60;
          if (minsEntrada > minsNormais) {
            horasDescontar += Math.round(((minsEntrada - minsNormais) / 60) * 100) / 100;
          }
        }
      }
    });

    var valor = Math.round(horasDescontar * salarioHora * 100) / 100;

    return {
      faltas_mes: nFaltas,
      atrasos_mes: nAtrasos,
      horas_descontar: Math.round(horasDescontar * 100) / 100,
      valor: valor,
      salario_diario: Math.round(salarioDiario * 100) / 100,
      salario_hora: Math.round(salarioHora * 100) / 100,
      salario_base: salarioBase,
    };
  } catch (e) {
    console.log("Erro ao calcular desconto estimado:", e.message);
    return { faltas_mes: 0, horas_descontar: 0, valor: 0, salario_diario: 0 };
  }
};

var getPortalStats = async function (req, res) {
  try {
    var colaborador = await Colaborador.findOne({
      where: { utilizador_id: req.utilizador.id, organizacao_id: req.utilizador.organizacao_id },
    });

    if (!colaborador) {
      return res.status(200).json({
        dados: {
          ferias: { disponiveis: 22, gozados: 0, planeados: 0, por_mes: [] },
          avaliacoes: { pontuacao: 0, ciclos: [] },
          pedidos_recentes: [],
          presencas: [],
          desconto_estimado: { faltas_mes: 0, horas_descontar: 0, valor: 0, salario_diario: 0 },
        },
      });
    }

    // Ferias
    var anoActual = new Date().getFullYear();
    var registoFerias = await Ferias.findOne({
      where: { colaborador_id: colaborador.id, ano: anoActual },
    });

    var feriasReg = registoFerias ? registoFerias.toJSON() : { dias_totais: 22, dias_gozados: 0, dias_restantes: 22 };

    var solicitacoes = await SolicitacaoFerias.findAll({
      where: { colaborador_id: colaborador.id },
      order: [["data_inicio", "ASC"]],
    });

    var feriasPorMes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var planeados = 0;
    solicitacoes.forEach(function (s) {
      if (s.estado === "Aprovado" || s.estado === "Gozado") {
        var dataInicio = new Date(s.data_inicio);
        var mes = dataInicio.getMonth();
        var dias = s.dias_solicitados || 1;
        feriasPorMes[mes] = feriasPorMes[mes] + dias;
      }
      if (s.estado === "Pendente" || s.estado === "Aguarda_Aprovacao") {
        planeados = planeados + (s.dias_solicitados || 1);
      }
    });

    var totalGozados = feriasPorMes.reduce(function (a, b) { return a + b; }, 0);

    // Avaliacoes
    var avaliacoes = await AvaliacaoDesempenho.findAll({
      where: { colaborador_id: colaborador.id },
      include: [{ model: CicloAvaliacao, as: "ciclo" }],
      order: [["createdAt", "DESC"]],
      limit: 5,
    });

    var ultimaNota = 0;
    var ciclos = [];
    avaliacoes.forEach(function (a) {
      var nota = a.nota_final ? parseFloat(a.nota_final) : 0;
      if (ultimaNota === 0 && nota > 0) ultimaNota = nota;
      ciclos.push({
        nome: a.ciclo ? a.ciclo.nome : "Avaliação",
        progresso: nota > 0 ? Math.min(Math.round((nota / 10) * 100), 100) : 0,
      });
    });

    // Pedidos recentes
    var pedidos = await PedidoColaborador.findAll({
      where: { colaborador_id: colaborador.id },
      order: [["createdAt", "DESC"]],
      limit: 8,
    });

    var pendentesCount = await PedidoColaborador.count({
      where: { colaborador_id: colaborador.id, estado: "pendente" },
    });
    var aprovadosCount = await PedidoColaborador.count({
      where: { colaborador_id: colaborador.id, estado: "aprovado" },
    });
    var rejeitadosCount = await PedidoColaborador.count({
      where: { colaborador_id: colaborador.id, estado: "rejeitado" },
    });

    var faltas = await RegistoPresenca.findAll({
      where: {
        colaborador_id: colaborador.id,
        estado: { [Op.in]: ["Ausente", "Atrasado"] },
      },
      attributes: ["id", "data", "estado", "hora_entrada", "observacoes", "justificado"],
      order: [["data", "DESC"]],
      limit: 20,
    });

    // Presencas (todos os registos, incluindo Presente)
    var presencas = await RegistoPresenca.findAll({
      where: { colaborador_id: colaborador.id },
      attributes: ["id", "data", "estado", "hora_entrada", "hora_saida", "horas_trabalhadas", "horas_extras", "metodo", "justificado"],
      order: [["data", "DESC"]],
      limit: 15,
    });

    return res.status(200).json({
      dados: {
        ferias: {
          disponiveis: feriasReg.dias_restantes || 22,
          gozados: totalGozados || feriasReg.dias_gozados || 0,
          planeados: planeados,
          por_mes: feriasPorMes,
        },
        avaliacoes: {
          pontuacao: ultimaNota,
          ciclos: ciclos,
        },
        pedidos_stats: {
          pendentes: pendentesCount,
          aprovados: aprovadosCount,
          rejeitados: rejeitadosCount,
        },
        pedidos_recentes: pedidos,
        faltas: faltas,
        presencas: presencas,
        desconto_estimado: await calcularDescontoEstimado(colaborador.id),
      },
    });
  } catch (e) {
    console.log("Erro ao obter stats do portal:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getRegistosPresenca = async function (req, res) {
  try {
    var colaborador = await Colaborador.findOne({
      where: { utilizador_id: req.utilizador.id, organizacao_id: req.utilizador.organizacao_id },
    });

    if (!colaborador) {
      return res.status(200).json({ dados: [], paginacao: { total: 0, pagina: 1, limite: 30, total_paginas: 0 } });
    }

    var data = req.query.data ? String(req.query.data).trim() : "";
    var mes = req.query.mes ? parseInt(req.query.mes, 10) : null;
    var ano = req.query.ano ? parseInt(req.query.ano, 10) : null;
    var dia = req.query.dia ? String(req.query.dia).padStart(2, "0") : "";
    var tipo = req.query.tipo ? String(req.query.tipo).trim() : "";
    var busca = req.query.busca ? String(req.query.busca).trim() : "";
    var pagina = req.query.pagina ? parseInt(req.query.pagina, 10) : 1;
    var limite = req.query.limite ? parseInt(req.query.limite, 10) : 30;
    if (!pagina || pagina < 1) pagina = 1;
    if (!limite || limite < 1 || limite > 200) limite = 30;

    var conds = [{ colaborador_id: colaborador.id }];

    if (data) {
      var dataNorm = normalizarData(data);
      if (dataNorm) conds.push({ data: dataNorm });
    } else if (ano) {
      if (mes) {
        var ultimoDiaMes = new Date(ano, mes, 0).getDate();
        conds.push({
          data: {
            [Op.between]: [
              ano + "-" + String(mes).padStart(2, "0") + "-01",
              ano + "-" + String(mes).padStart(2, "0") + "-" + String(ultimoDiaMes).padStart(2, "0"),
            ],
          },
        });
      } else {
        conds.push({ data: { [Op.between]: [ano + "-01-01", ano + "-12-31"] } });
      }
    } else if (mes) {
      var anoActual = new Date().getFullYear();
      var ultimoDia = new Date(anoActual, mes, 0).getDate();
      conds.push({
        data: {
          [Op.between]: [
            anoActual + "-" + String(mes).padStart(2, "0") + "-01",
            anoActual + "-" + String(mes).padStart(2, "0") + "-" + String(ultimoDia).padStart(2, "0"),
          ],
        },
      });
    }

    if (dia) {
      conds.push(Sequelize.where(Sequelize.fn("DATE_FORMAT", Sequelize.col("data"), "%d"), dia));
    }

    var estados = null;
    if (tipo === "falta" || tipo === "faltas") estados = ["Ausente", "Atrasado"];
    else if (tipo === "ausencia" || tipo === "ausente") estados = ["Ausente"];
    else if (tipo === "atraso" || tipo === "atrasado") estados = ["Atrasado"];
    else if (tipo === "presente") estados = ["Presente"];
    else if (tipo === "licenca") estados = ["Licenca"];
    else if (tipo === "ferias") estados = ["Ferias"];
    else if (tipo === "fim_semana") estados = ["Fim_semana"];
    if (estados) conds.push({ estado: { [Op.in]: estados } });

    if (busca) {
      conds.push({
        [Op.or]: [
          { data: { [Op.like]: "%" + busca + "%" } },
          { estado: { [Op.like]: "%" + busca + "%" } },
          { observacoes: { [Op.like]: "%" + busca + "%" } },
        ],
      });
    }

    var offset = (pagina - 1) * limite;

    var resultado = await RegistoPresenca.findAndCountAll({
      where: { [Op.and]: conds },
      attributes: ["id", "data", "estado", "hora_entrada", "hora_saida", "horas_trabalhadas", "horas_extras", "metodo", "justificado", "observacoes"],
      order: [["data", "DESC"], ["createdAt", "DESC"]],
      limit: limite,
      offset: offset,
    });

    return res.status(200).json({
      dados: resultado.rows,
      paginacao: {
        total: resultado.count,
        pagina: pagina,
        limite: limite,
        total_paginas: Math.ceil(resultado.count / limite),
      },
    });
  } catch (e) {
    console.log("Erro ao obter registos de presença:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { getPortalStats, getRegistosPresenca };