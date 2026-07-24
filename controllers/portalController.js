var { Colaborador, Ferias, SolicitacaoFerias, AvaliacaoDesempenho, CicloAvaliacao, PedidoColaborador } = require("../models");

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
      },
    });
  } catch (e) {
    console.log("Erro ao obter stats do portal:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { getPortalStats };
