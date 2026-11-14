var ExcelJS = require("exceljs");
var { Pagamento, Colaborador, Organizacao } = require("../models");
var { listarPagamentosParaResumo } = require("./folhaSalarialController");
var { incluirColaboradorDaOrg } = require("../helpers/organizacao");

var MESES = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

var UNIDADES_VALIDAS = ["Artes Gráficas", "Formação Profissional", "Soluções Digitais"];

var EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function toNum(v) {
  var n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// Converte datas DATEONLY ("YYYY-MM-DD") em Date para o Excel as tratar como data.
function excelDate(value) {
  if (!value) return "";
  var s = String(value).substring(0, 10);
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
}

function slug(str) {
  return String(str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function getOrganizacao(colab) {
  if (colab && colab.organizacao_id) {
    return await Organizacao.findByPk(colab.organizacao_id);
  }
  return null;
}

function applyHeaderStyle(cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2B3A4A" } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: "FFD0D7DE" } },
    left: { style: "thin", color: { argb: "FFD0D7DE" } },
    bottom: { style: "thin", color: { argb: "FFD0D7DE" } },
    right: { style: "thin", color: { argb: "FFD0D7DE" } },
  };
}

function applyBodyStyle(cell) {
  cell.font = { size: 10 };
  cell.alignment = { vertical: "middle", wrapText: true };
  cell.border = {
    top: { style: "thin", color: { argb: "FFE0E0E0" } },
    left: { style: "thin", color: { argb: "FFE0E0E0" } },
    bottom: { style: "thin", color: { argb: "FFE0E0E0" } },
    right: { style: "thin", color: { argb: "FFE0E0E0" } },
  };
}

function setMoney(cell) {
  cell.numFmt = "#,##0.00";
  cell.alignment = { vertical: "middle", horizontal: "right" };
}

function sendWorkbook(res, workbook, filename) {
  res.setHeader("Content-Type", EXCEL_MIME);
  res.setHeader("Content-Disposition", "attachment; filename=" + filename);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  return workbook.xlsx.write(res).then(function () {
    res.end();
  });
}

// ==================== RESUMO DE PAGAMENTOS EM EXCEL ====================

exports.resumoPagamentos = async function (req, res) {
  try {
    var mes = parseInt(req.query.mes, 10);
    var ano = parseInt(req.query.ano, 10);
    if (!mes || !ano) {
      return res.status(400).json({ error: "mes e ano sao obrigatorios" });
    }

    var unidade = req.query.unidade_negocio ? String(req.query.unidade_negocio).trim() : "";
    if (unidade && unidade !== "Todas" && UNIDADES_VALIDAS.indexOf(unidade) === -1) {
      return res.status(400).json({ error: "Unidade de negócio inválida. Valores permitidos: " + UNIDADES_VALIDAS.join(", ") });
    }
    var mostrarUnidade = unidade && unidade !== "Todas";

    var pagamentos = await listarPagamentosParaResumo(mes, ano, unidade, req.organizacao_id);
    if (pagamentos.length === 0) {
      return res.status(404).json({ error: "Nenhum pagamento encontrado para o periodo indicado" + (mostrarUnidade ? " na unidade " + unidade : "") });
    }

    var primeiroColab = null;
    for (var i = 0; i < pagamentos.length; i++) {
      if (pagamentos[i] && pagamentos[i].colaborador && pagamentos[i].colaborador.organizacao_id) {
        primeiroColab = pagamentos[i].colaborador;
        break;
      }
    }
    var org = await getOrganizacao(primeiroColab);

    var totais = {
      bruto: 0,
      subsidios: 0,
      extras: 0,
      irt: 0,
      ss: 0,
      descontoFaltas: 0,
      descontos: 0,
      liquido: 0,
      pendente: 0,
      pago: 0,
      cancelado: 0,
    };

    pagamentos.forEach(function (p) {
      totais.bruto += toNum(p.salario_base);
      totais.subsidios += toNum(p.subsidios);
      totais.extras += toNum(p.horas_extras);
      totais.irt += toNum(p.irt);
      totais.ss += toNum(p.seguranca_social);
      totais.descontoFaltas += toNum(p.desconto_faltas);
      totais.descontos += toNum(p.descontos);
      totais.liquido += toNum(p.total_liquido);
      if (p.estado === "Pendente") totais.pendente++;
      else if (p.estado === "Pago") totais.pago++;
      else if (p.estado === "Cancelado") totais.cancelado++;
    });

    var wb = new ExcelJS.Workbook();
    wb.creator = org && org.nome ? org.nome : "SGHR";
    wb.created = new Date();

    var periodo = MESES[mes - 1] + " de " + ano;
    var tituloOrg = (org && org.nome) ? org.nome : "SGHR";

    // Folha unica, com o mesmo conteudo da folha salarial em PDF:
    // cabecalho da organizacao -> SUMARIO DO PERIODO -> DETALHE POR COLABORADOR.
    var ws = wb.addWorksheet("Folha Salarial", {
      views: [{ showGridLines: false }],
      pageSetup: {
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      },
    });

    ws.columns = [
      { width: 6 },   // N.
      { width: 34 },  // Colaborador
      { width: 30 },  // IBAN
      { width: 14 },  // Salario Base
      { width: 13 },  // Subsidios
      { width: 12 },  // Extras
      { width: 12 },  // IRT
      { width: 12 },  // INSS
      { width: 14 },  // Descontos
      { width: 13 },  // Faltas
      { width: 15 },  // Liquido
      { width: 11 },  // Estado
    ];

    var LAST_COL = 12;
    var r = 1;

    function fullRange(row) {
      return "A" + row + ":L" + row;
    }

    function mergeFull(row, value, font, alignment) {
      ws.mergeCells(fullRange(row));
      var cell = ws.getCell("A" + row);
      cell.value = value;
      if (font) cell.font = font;
      cell.alignment = alignment || { vertical: "middle" };
      return cell;
    }

    // Cabecalho
    mergeFull(r++, tituloOrg, { bold: true, size: 16 }, { horizontal: "center", vertical: "middle" });
    mergeFull(r++, "Resumo de Pagamentos", { bold: true, size: 13 }, { horizontal: "center", vertical: "middle" });
    mergeFull(r++, "Mês de " + periodo, { size: 10, color: { argb: "FF666666" } }, { horizontal: "center", vertical: "middle" });
    if (mostrarUnidade) {
      mergeFull(r++, "Unidade de Negócio: " + unidade, { bold: true, size: 10 }, { horizontal: "center", vertical: "middle" });
    }
    r += 1;

    // Sumario do periodo
    mergeFull(r++, "SUMÁRIO DO PERÍODO", { bold: true, size: 11 }, { horizontal: "left", vertical: "middle" });

    function summaryRow(label, value, opts) {
      opts = opts || {};
      ws.mergeCells("A" + r + ":G" + r);
      ws.mergeCells("H" + r + ":L" + r);
      var cLabel = ws.getCell("A" + r);
      var cValue = ws.getCell("H" + r);
      cLabel.value = label;
      cValue.value = value;
      cLabel.font = { bold: !!opts.bold, size: 10 };
      cValue.font = { bold: !!opts.bold, size: 10 };
      cLabel.alignment = { vertical: "middle", horizontal: "left" };
      cValue.alignment = { vertical: "middle", horizontal: "right" };
      if (opts.integer) cValue.numFmt = "0";
      else if (!opts.text) cValue.numFmt = "#,##0.00";
      if (opts.bold) {
        cLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
        cValue.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
      }
      r += 1;
    }

    summaryRow("Total de Colaboradores", pagamentos.length, { integer: true });
    summaryRow("Total Vencimentos (Bruto)", totais.bruto);
    summaryRow("  Subsídios", totais.subsidios);
    summaryRow("  Horas Extras", totais.extras);
    summaryRow("Total IRT", -totais.irt);
    summaryRow("Total INSS", -totais.ss);
    summaryRow("Total Desconto Faltas", -totais.descontoFaltas);
    summaryRow("Total Descontos", -totais.descontos);
    summaryRow("TOTAL LÍQUIDO A PAGAR", totais.liquido, { bold: true });

    ws.mergeCells(fullRange(r));
    ws.getCell("A" + r).value = "Estado: Pendente " + totais.pendente + " | Pago " + totais.pago + " | Cancelado " + totais.cancelado;
    ws.getCell("A" + r).font = { size: 10, color: { argb: "FF666666" } };
    ws.getCell("A" + r).alignment = { vertical: "middle", horizontal: "left" };
    r += 2;

    // Detalhe por colaborador (mesmas colunas do PDF)
    mergeFull(r++, "DETALHE POR COLABORADOR", { bold: true, size: 11 }, { horizontal: "left", vertical: "middle" });

    var headers = ["N.", "Colaborador", "IBAN", "Salario Base", "Subsidios", "Extras", "IRT", "INSS", "Descontos", "Faltas", "Liquido", "Estado"];
    headers.forEach(function (h, idx) {
      var cell = ws.getCell(r, idx + 1);
      cell.value = h;
      applyHeaderStyle(cell);
    });
    ws.getRow(r).height = 26;
    r += 1;

    pagamentos.forEach(function (p, idx) {
      var colab = p.colaborador || {};
      var values = [
        idx + 1,
        colab.nome_completo || "",
        colab.iban || "",
        toNum(p.salario_base),
        toNum(p.subsidios),
        toNum(p.horas_extras),
        toNum(p.irt),
        toNum(p.seguranca_social),
        toNum(p.descontos),
        toNum(p.desconto_faltas),
        toNum(p.total_liquido),
        p.estado || "",
      ];
      values.forEach(function (v, c) {
        var cell = ws.getCell(r, c + 1);
        cell.value = v;
        applyBodyStyle(cell);
        if (c >= 3 && c <= 10) setMoney(cell);
      });
      r += 1;
    });

    // Linha de totais
    ws.getCell(r, 2).value = "TOTAL";
    ws.getCell(r, 4).value = totais.bruto;
    ws.getCell(r, 5).value = totais.subsidios;
    ws.getCell(r, 6).value = totais.extras;
    ws.getCell(r, 7).value = totais.irt;
    ws.getCell(r, 8).value = totais.ss;
    ws.getCell(r, 9).value = totais.descontos;
    ws.getCell(r, 10).value = totais.descontoFaltas;
    ws.getCell(r, 11).value = totais.liquido;
    for (var tc = 1; tc <= LAST_COL; tc++) {
      var tcell = ws.getCell(r, tc);
      applyBodyStyle(tcell);
      tcell.font = { bold: true, size: 10 };
      tcell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
      if (tc >= 4 && tc <= 11) setMoney(tcell);
    }
    ws.getCell(r, 2).alignment = { vertical: "middle", horizontal: "right" };
    r += 2;

    // Rodape
    mergeFull(r, tituloOrg + " | Documento gerado pelo sistema SGHR", { size: 8, color: { argb: "FF999999" } }, { horizontal: "center", vertical: "middle" });

    var nomeFicheiro = "resumo_pagamentos_" + mes + "_" + ano + (mostrarUnidade ? "_" + slug(unidade) : "") + ".xlsx";
    return sendWorkbook(res, wb, nomeFicheiro);
  } catch (e) {
    console.log("Erro ao gerar Excel resumo pagamentos:", e.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Erro ao gerar Excel" });
    }
  }
};

// ==================== RECIBO / FOLHA INDIVIDUAL EM EXCEL ====================

exports.folhaSalarial = async function (req, res) {
  try {
    var pagamento = await Pagamento.findOne({
      where: { id: req.params.id },
      include: [
        incluirColaboradorDaOrg(req.organizacao_id, [
          "id", "nome_completo", "numero_colaborador", "nif", "numero_seguranca_social",
          "conta_bancaria", "iban", "banco", "organizacao_id", "unidade_negocio",
        ]),
      ],
    });
    if (!pagamento) {
      return res.status(404).json({ error: "Pagamento nao encontrado" });
    }

    var colab = pagamento.colaborador;
    var org = await getOrganizacao(colab);

    var wb = new ExcelJS.Workbook();
    wb.creator = org && org.nome ? org.nome : "SGHR";
    wb.created = new Date();

    var ws = wb.addWorksheet("Recibo", {
      views: [{ showGridLines: false }],
      pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    });
    ws.columns = [{ width: 34 }, { width: 22 }];

    var tituloOrg = (org && org.nome) ? org.nome : "SGHR";
    ws.mergeCells("A1:B1");
    ws.getCell("A1").value = tituloOrg;
    ws.getCell("A1").font = { bold: true, size: 16 };
    ws.getCell("A1").alignment = { horizontal: "center" };

    ws.mergeCells("A2:B2");
    ws.getCell("A2").value = "Recibo de Vencimento";
    ws.getCell("A2").font = { bold: true, size: 13 };
    ws.getCell("A2").alignment = { horizontal: "center" };

    ws.mergeCells("A3:B3");
    ws.getCell("A3").value = "Mês de " + MESES[pagamento.mes - 1] + " de " + pagamento.ano;
    ws.getCell("A3").font = { size: 10, color: { argb: "FF666666" } };
    ws.getCell("A3").alignment = { horizontal: "center" };

    var y = 5;

    function tituloSecao(texto) {
      ws.mergeCells("A" + y + ":B" + y);
      var cell = ws.getCell("A" + y);
      cell.value = texto;
      cell.font = { bold: true, size: 11 };
      cell.alignment = { horizontal: "left" };
      y += 1;
    }

    function linha(label, value, opts) {
      opts = opts || {};
      var c1 = ws.getCell("A" + y);
      var c2 = ws.getCell("B" + y);
      c1.value = label;
      c2.value = value;
      c1.font = { bold: !!opts.bold, size: 10 };
      c2.font = { bold: !!opts.bold, size: 10 };
      c1.alignment = { vertical: "middle" };
      if (opts.money) setMoney(c2);
      else c2.alignment = { vertical: "middle", horizontal: "right" };
      if (opts.bold) {
        c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
        c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEF2F7" } };
      }
      y += 1;
    }

    if (colab) {
      tituloSecao("Dados do Colaborador");
      linha("Nome", colab.nome_completo || "");
      linha("N. Colaborador", colab.numero_colaborador || "");
      if (colab.nif) linha("NIF", colab.nif);
      if (colab.numero_seguranca_social) linha("N. Segurança Social", colab.numero_seguranca_social);
      if (colab.conta_bancaria) linha("Conta Bancária", colab.conta_bancaria);
      if (colab.iban) linha("IBAN", colab.iban);
      y += 1;
    }

    tituloSecao("Detalhes do Vencimento");
    ws.getCell("A" + y).value = "Descrição";
    ws.getCell("B" + y).value = "Valores (AOA)";
    applyHeaderStyle(ws.getCell("A" + y));
    applyHeaderStyle(ws.getCell("B" + y));
    y += 1;

    var totalVencimentos = toNum(pagamento.salario_base) + toNum(pagamento.subsidios) + toNum(pagamento.horas_extras);
    ws.getCell("A" + y).value = "VENCIMENTOS";
    ws.getCell("A" + y).font = { bold: true, size: 10 };
    y += 1;
    linha("  Salário Base", toNum(pagamento.salario_base), { money: true });
    if (toNum(pagamento.subsidios) > 0) linha("  Subsídios", toNum(pagamento.subsidios), { money: true });
    if (toNum(pagamento.horas_extras) > 0) linha("  Horas Extras", toNum(pagamento.horas_extras), { money: true });
    linha("Total Vencimentos", totalVencimentos, { money: true, bold: true });
    y += 1;

    var totalDescontos = toNum(pagamento.irt) + toNum(pagamento.seguranca_social) + toNum(pagamento.descontos) + toNum(pagamento.desconto_faltas);
    ws.getCell("A" + y).value = "DESCONTOS";
    ws.getCell("A" + y).font = { bold: true, size: 10 };
    y += 1;
    if (toNum(pagamento.irt) > 0) linha("  IRT", -toNum(pagamento.irt), { money: true });
    if (toNum(pagamento.seguranca_social) > 0) linha("  INSS", -toNum(pagamento.seguranca_social), { money: true });
    if (toNum(pagamento.descontos) > 0) linha("  Outros Descontos", -toNum(pagamento.descontos), { money: true });
    if (toNum(pagamento.desconto_faltas) > 0) linha("  Desconto Faltas", -toNum(pagamento.desconto_faltas), { money: true });
    linha("Total Descontos", -totalDescontos, { money: true, bold: true });
    y += 1;

    linha("TOTAL LÍQUIDO A RECEBER", toNum(pagamento.total_liquido), { money: true, bold: true });

    var totalCell = ws.getCell("B" + (y - 1));
    totalCell.font = { bold: true, size: 13 };
    totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
    ws.getCell("A" + (y - 1)).font = { bold: true, size: 12 };
    ws.getCell("A" + (y - 1)).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEBF7" } };
    y += 1;

    linha("Estado", pagamento.estado || "");
    if (pagamento.data_pagamento) {
      linha("Data de Pagamento", excelDate(pagamento.data_pagamento));
      if (ws.getCell("B" + (y - 1)).value instanceof Date) ws.getCell("B" + (y - 1)).numFmt = "dd/mm/yyyy";
    }
    linha("Período", MESES[pagamento.mes - 1] + " / " + pagamento.ano);

    var nomeFicheiro = "recibo_" + slug(colab ? colab.numero_colaborador : "") + "_" + pagamento.mes + "_" + pagamento.ano + ".xlsx";
    return sendWorkbook(res, wb, nomeFicheiro);
  } catch (e) {
    console.log("Erro ao gerar Excel folha salarial:", e.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Erro ao gerar Excel" });
    }
  }
};
