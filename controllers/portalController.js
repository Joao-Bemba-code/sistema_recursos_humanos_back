var { Colaborador, Ferias, SolicitacaoFerias, AvaliacaoDesempenho, CicloAvaliacao, PedidoColaborador, RegistoPresenca, Contrato } = require("../models");
var { Op } = require("sequelize");

var calcularDescontoEstimado = async function (colaborador_id) {
  try {
    var ano = new Date().getFullYear();
    var mes = new Date().getMonth() + 1;
    var strInicio = ano + "-" + (mes < 10 ? "0" + mes : mes) + "-01";
    var ultimoDia = new Date(ano, mes, 0).getDate();
    var strFim = ano + "-" + (mes < 10 ? "0" + mes : mes) + "-" + ultimoDia;

    var faltas = await RegistoPresenca.findAll({
      where: {
        colaborador_id: colaborador_id,
        estado: { [Op.in]: ["Ausente", "Atrasado"] },
        justificado: false,
        data: { [Op.between]: [strInicio, strFim] },
      },
      attributes: ["data", "estado", "hora_entrada"],
    });

    if (faltas.length === 0) {
      return { faltas_mes: 0, horas_descontar: 0, valor: 0, salario_diario: 0, meses: [] };
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

module.exports = { getPortalStats };