// Regras de elegibilidade para pedidos de credito no portal do colaborador.
// Nao altera dados: apenas calcula o elegivel e os motivos de indisponibilidade.
var { Op } = require("sequelize");
var { Colaborador, Contrato, Vencimento, RegistoPresenca } = require("../models");

var DIAS_ANALISE = 60;
var ANTIGUIDADE_MINIMA_MESES = 12;
var PERCENTAGEM_MAXIMA = 0.30;
var ATRASOS_MAXIMOS = 2;

var comoData = function (valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  var texto = String(valor).substring(0, 10);
  var d = new Date(texto + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
};

var mesesEntre = function (inicio, fim) {
  if (!inicio || !fim) return 0;
  var meses = (fim.getFullYear() - inicio.getFullYear()) * 12 +
    (fim.getMonth() - inicio.getMonth());
  if (fim.getDate() < inicio.getDate()) meses--;
  return Math.max(0, meses);
};

var dataHaNDias = function (dias) {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dias);
  var mes = String(d.getMonth() + 1).padStart(2, "0");
  var dia = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + mes + "-" + dia;
};

var avaliarElegibilidadeCredito = async function (colaboradorId, opcoes) {
  var opts = opcoes || {};
  var valor = Number(opts.valor || 0);
  var parcelas = parseInt(opts.parcelas || 0, 10);
  var agora = new Date();

  var colaborador = await Colaborador.findByPk(colaboradorId);
  if (!colaborador) {
    return {
      elegivel: false,
      motivos: ["Colaborador nao encontrado"],
      salario_liquido: 0,
      meses_servico: 0,
      faltas_60d: 0,
      atrasos_60d: 0,
      prestacao_mensal: 0,
      limite_mensal: 0,
    };
  }

  var contrato = await Contrato.findOne({
    where: { colaborador_id: colaboradorId, estado: "Activo" },
    order: [["data_inicio", "DESC"]],
  });
  var admissao = comoData(colaborador.data_admissao) ||
    (contrato ? comoData(contrato.data_inicio) : null);

  var vencimento = await Vencimento.findOne({
    where: { colaborador_id: colaboradorId, estado: "Activo" },
    order: [["data_inicio", "DESC"]],
  });
  var salarioLiquido = vencimento
    ? Number(vencimento.total_liquido)
    : (contrato ? Number(contrato.salario_base) : 0);

  var desde = dataHaNDias(DIAS_ANALISE);
  var faltas = await RegistoPresenca.count({
    where: { colaborador_id: colaboradorId, data: { [Op.gte]: desde }, estado: "Ausente" },
  });
  var atrasos = await RegistoPresenca.count({
    where: { colaborador_id: colaboradorId, data: { [Op.gte]: desde }, estado: "Atrasado" },
  });

  var mesesServico = mesesEntre(admissao, agora);
  var limiteMensal = Math.round((salarioLiquido * PERCENTAGEM_MAXIMA + Number.EPSILON) * 100) / 100;
  var prestacao = parcelas > 0 ? Math.round((valor / parcelas + Number.EPSILON) * 100) / 100 : 0;

  var motivos = [];
  if (mesesServico < ANTIGUIDADE_MINIMA_MESES) {
    motivos.push("Antiguidade inferior a " + ANTIGUIDADE_MINIMA_MESES + " meses (" + mesesServico + " mes(es))");
  }
  if (faltas > 0) {
    motivos.push("Existem " + faltas + " falta(s) nos ultimos " + DIAS_ANALISE + " dias");
  }
  if (atrasos > ATRASOS_MAXIMOS) {
    motivos.push("Existem " + atrasos + " atraso(s) nos ultimos " + DIAS_ANALISE + " dias (maximo " + ATRASOS_MAXIMOS + ")");
  }
  if (!(valor > 0)) {
    motivos.push("O valor solicitado deve ser superior a zero");
  }
  if (!(parcelas > 0)) {
    motivos.push("O numero de parcelas deve ser superior a zero");
  } else if (prestacao > limiteMensal) {
    motivos.push("A prestacao mensal (" + prestacao.toFixed(2) + ") ultrapassa 30% do salario liquido (" + limiteMensal.toFixed(2) + ")");
  }

  return {
    elegivel: motivos.length === 0,
    motivos: motivos,
    colaborador_id: colaboradorId,
    nome: colaborador.nome_completo,
    numero_colaborador: colaborador.numero_colaborador,
    data_admissao: admissao ? comoData(admissao).toISOString().substring(0, 10) : null,
    meses_servico: mesesServico,
    salario_liquido: Math.round(salarioLiquido * 100) / 100,
    faltas_60d: faltas,
    atrasos_60d: atrasos,
    valor_solicitado: valor,
    parcelas: parcelas,
    prestacao_mensal: prestacao,
    percentagem_maxima: PERCENTAGEM_MAXIMA,
    limite_mensal: limiteMensal,
    dias_analise: DIAS_ANALISE,
    avaliado_em: agora.toISOString(),
  };
};

module.exports = {
  avaliarElegibilidadeCredito,
  DIAS_ANALISE,
  ANTIGUIDADE_MINIMA_MESES,
  PERCENTAGEM_MAXIMA,
  ATRASOS_MAXIMOS,
};
