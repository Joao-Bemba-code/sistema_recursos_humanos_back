// Geracao da ficha de pedido de dispensa (RH-FORM-02/2026).
// Segue o mesmo padrao grafico da ficha de credito, com as referencias KSCP.
var PDFDocument = require("pdfkit");
var { PedidoColaborador, Colaborador, Contrato } = require("../models");

var MARGEM = 40;
var LARGURA = 515; // 595 (A4) - 2 * 40

var ROTULOS_ESTADO = {
  pendente: "PENDENTE",
  processando: "EM ANÁLISE",
  aprovado: "APROVADO",
  rejeitado: "REJEITADO",
  cancelado: "CANCELADO",
};

var formatarData = function (valor) {
  if (!valor) return "__ / __ / ______";
  var texto = String(valor);
  var d = /^\d{4}-\d{2}-\d{2}/.test(texto)
    ? new Date(texto.substring(0, 10) + "T00:00:00")
    : new Date(texto);
  if (isNaN(d.getTime())) return "__ / __ / ______";
  return String(d.getDate()).padStart(2, "0") + " / " +
    String(d.getMonth() + 1).padStart(2, "0") + " / " + d.getFullYear();
};

var diasEntre = function (inicio, fim) {
  if (!inicio || !fim) return 0;
  var a = new Date(String(inicio).substring(0, 10) + "T00:00:00");
  var b = new Date(String(fim).substring(0, 10) + "T00:00:00");
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
};

var caixa = function (doc, x, y, w, h) {
  doc.rect(x, y, w, h).lineWidth(0.5).strokeColor("#444444").stroke();
};

var rotulo = function (doc, texto, x, y, w) {
  doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#333333")
    .text(texto, x + 3, y + 3, { width: w - 6, align: "center" });
};

var valor = function (doc, texto, x, y, w, h) {
  doc.font("Helvetica").fontSize(8).fillColor("#111111")
    .text(String(texto == null || texto === "" ? "—" : texto), x + 3, y + (h || 22) / 2 - 4, {
      width: w - 6,
      align: "center",
    });
};

var campoComValor = function (doc, titulo, conteudo, x, y, w, h) {
  h = h || 30;
  caixa(doc, x, y, w, h);
  rotulo(doc, titulo, x, y, w);
  valor(doc, conteudo, x, y, w, h);
};

var seccao = function (doc, numero, titulo, y) {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111111")
    .text(numero + ". " + titulo, MARGEM, y, { width: LARGURA });
};

var linhaTabela = function (doc, colunas, larguras, y, altura, estilos) {
  var x = MARGEM;
  for (var i = 0; i < colunas.length; i++) {
    caixa(doc, x, y, larguras[i], altura);
    if (estilos && estilos[i] === "bold") {
      doc.font("Helvetica-Bold").fontSize(6.5);
    } else {
      doc.font("Helvetica").fontSize(7.5);
    }
    doc.fillColor("#111111").text(String(colunas[i] == null ? "" : colunas[i]), x + 3, y + 3, {
      width: larguras[i] - 6,
      align: "left",
      lineBreak: false,
    });
    x += larguras[i];
  }
};

var gerarFichaDispensa = async function (req, res) {
  try {
    var pedido = await PedidoColaborador.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
        tipo: "dispensa",
      },
      include: [
        {
          model: Colaborador,
          as: "colaborador",
          attributes: ["id", "nome_completo", "numero_colaborador", "unidade_negocio"],
        },
      ],
    });

    if (!pedido) {
      return res.status(404).json({ error: "Pedido de dispensa não encontrado" });
    }

    var dados = pedido.dados || {};
    if (typeof dados === "string") {
      try { dados = JSON.parse(dados); } catch (e) { dados = {}; }
    }

    var contrato = await Contrato.findOne({
      where: { colaborador_id: pedido.colaborador_id },
      order: [["data_inicio", "DESC"]],
    });

    var estadoPedido = ROTULOS_ESTADO[pedido.estado] || String(pedido.estado || "—").toUpperCase();
    var numeroDias = parseInt(dados.numero_dias, 10) || diasEntre(dados.data_inicio, dados.data_fim);
    var documentoAnexado = !!pedido.documento;

    var nomeArquivo = "RH-FORM-02-2026-" +
      String((pedido.colaborador && pedido.colaborador.numero_colaborador) || "colaborador")
        .replace(/[^A-Za-z0-9-]/g, "") + ".pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=\"" + nomeArquivo + "\"");
    res.setHeader("Cache-Control", "no-store");

    var doc = new PDFDocument({ size: "A4", margin: MARGEM, bufferPages: true, compress: false });
    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111")
      .text("ANEXO II — FICHA DE PEDIDO DE DISPENSA", MARGEM, 28, { width: LARGURA, align: "center" });
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#444444")
      .text("INTERNO REF: KSCP  |  RH-FORM-02/2026", MARGEM, 44, { width: LARGURA, align: "center" });
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#555555")
      .text("ESTADO DO PEDIDO (SGHR): " + estadoPedido + "   |   REF. PEDIDO: " + pedido.id, MARGEM, 53, { width: LARGURA, align: "center" });

    // 1. Identificacao
    seccao(doc, "1", "Identificação do Colaborador (Dados SGHR)", 62);
    var larguras3 = [LARGURA / 3, LARGURA / 3, LARGURA / 3];
    linhaTabela(doc, ["NOME COMPLETO", "N.º COLABORADOR", "DATA DO PEDIDO"], larguras3, 74, 13, ["bold", "bold", "bold"]);
    linhaTabela(doc, [
      (pedido.colaborador && pedido.colaborador.nome_completo) || "—",
      (pedido.colaborador && pedido.colaborador.numero_colaborador) || "—",
      formatarData(pedido.createdAt),
    ], larguras3, 87, 18);
    linhaTabela(doc, ["ABRANGÊNCIA / UNIDADE", "GRUPO PROFISSIONAL / FUNÇÃO", "TIPO DE PEDIDO"], larguras3, 105, 13, ["bold", "bold", "bold"]);
    linhaTabela(doc, [
      (pedido.colaborador && pedido.colaborador.unidade_negocio) || "—",
      (contrato && contrato.funcao) || "—",
      "Dispensa",
    ], larguras3, 118, 18);

    // 2. Periodo e motivo
    seccao(doc, "2", "Período da Dispensa e Justificação", 153);
    var larguras4 = [LARGURA / 4, LARGURA / 4, LARGURA / 4, LARGURA / 4];
    linhaTabela(doc, ["DATA DE INÍCIO", "DATA DE FIM", "N.º DE DIAS", "COMPROVATIVO"], larguras4, 165, 13, ["bold", "bold", "bold", "bold"]);
    linhaTabela(doc, [
      formatarData(dados.data_inicio),
      formatarData(dados.data_fim || dados.data_inicio),
      numeroDias || "—",
      documentoAnexado ? "Sim (anexo)" : "Não",
    ], larguras4, 178, 18);
    campoComValor(doc, "MOTIVO / JUSTIFICAÇÃO DO PEDIDO", pedido.descricao || pedido.titulo || "—", MARGEM, 199, LARGURA, 42);

    // 3. Validacao tecnica
    seccao(doc, "3", "Validação Técnica (Preenchimento Exclusivo RH — Capítulo 1)", 250);
    var largurasCrit = [235, 170, 110];
    linhaTabela(doc, ["CRITÉRIO NORMATIVO", "APURAMENTO SGHR", "CONFORMIDADE"], largurasCrit, 262, 13, ["bold", "bold", "bold"]);
    var conformidade = function (ok) {
      return (ok ? "[x] Sim  [ ] Não" : "[ ] Sim  [x] Não");
    };
    var linhas = [
      ["Pedido registado no SGHR", "Ref.: " + pedido.id, conformidade(true)],
      ["Período da dispensa informado", (dados.data_inicio || "__ / __ / ____") + " a " + (dados.data_fim || "__ / __ / ____"), conformidade(!!(dados.data_inicio && dados.data_fim))],
      ["Documento de comprovativo", documentoAnexado ? "Anexado ao pedido" : "Não anexado", conformidade(true)],
    ];
    var yCrit = 275;
    linhas.forEach(function (linha) {
      linhaTabela(doc, linha, largurasCrit, yCrit, 22);
      yCrit += 22;
    });

    // 4. Despacho final
    seccao(doc, "4", "DESPACHO FINAL DA GERÊNCIA (PRAZO ATÉ 72H)", yCrit + 6);
    var yDespacho = yCrit + 18;
    var decisaoAprovado = pedido.estado === "aprovado" ? "[x]" : "[  ]";
    var decisaoRecusado = pedido.estado === "rejeitado" ? "[x]" : "[  ]";
    campoComValor(doc, "DECISÃO", decisaoAprovado + " APROVADO     " + decisaoRecusado + " RECUSADO   (Motivo: ________________________________)", MARGEM, yDespacho, LARGURA, 26);
    campoComValor(doc, "ASSINATURA E CARIMBO DA GERÊNCIA", "", MARGEM, yDespacho + 29, LARGURA * 0.7, 26);
    campoComValor(doc, "DATA", "__ / __ / ______", MARGEM + LARGURA * 0.7, yDespacho + 29, LARGURA * 0.3, 26);
    campoComValor(doc, "ASSINATURA DO COLABORADOR", "", MARGEM, yDespacho + 58, LARGURA / 2, 26);
    campoComValor(doc, "CONFERÊNCIA RECURSOS HUMANOS (SGHR)", "", MARGEM + LARGURA / 2, yDespacho + 58, LARGURA / 2, 26);

    doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#333333")
      .text(
        "GRUPO KAMATAMBU — OFICINA DE ARTES GRÁFICAS  |  GAVETA 1 (GERÊNCIA)  REF: KSCP  |  MAN-RH-01/2026 — Pág. 1 de 1",
        MARGEM, 800, { width: LARGURA, align: "center" }
      );

    doc.end();
  } catch (e) {
    console.log("Erro ao gerar ficha de dispensa:", e.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Erro ao gerar a ficha de dispensa" });
    }
    res.end();
  }
};

module.exports = { gerarFichaDispensa };
