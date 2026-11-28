// Geracao da Ficha de Solicitacao de Credito (RH-FORM-01/2026).
// O layout segue o modelo em anexo (ANEXO I), com os dados do pedido e a
// validacao tecnica ja apurada pelo SGHR.
var PDFDocument = require("pdfkit");
var { PedidoColaborador, Colaborador, Contrato, Credito } = require("../models");
var { avaliarElegibilidadeCredito } = require("../helpers/elegibilidadeCredito");

var MARGEM = 40;
var LARGURA = 515; // 595 (A4) - 2 * 40

var ROTULOS_ESTADO = {
  pendente: "PENDENTE",
  processando: "EM ANÁLISE",
  aprovado: "APROVADO",
  rejeitado: "REJEITADO",
  cancelado: "CANCELADO",
};

var formatarMoeda = function (valor) {
  return Number(valor || 0).toLocaleString("pt-AO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

var gerarFichaCredito = async function (req, res) {
  try {
    var pedido = await PedidoColaborador.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
        tipo: "credito",
      },
      include: [
        {
          model: Colaborador,
          as: "colaborador",
          attributes: ["id", "nome_completo", "numero_colaborador", "data_admissao", "unidade_negocio"],
        },
      ],
    });

    if (!pedido) {
      return res.status(404).json({ error: "Pedido de crédito não encontrado" });
    }

    var estadoPedido = ROTULOS_ESTADO[pedido.estado] || String(pedido.estado || "—").toUpperCase();
    var dados = pedido.dados || {};
    var elegibilidade = dados.elegibilidade;
    if (!elegibilidade) {
      elegibilidade = await avaliarElegibilidadeCredito(pedido.colaborador_id, {
        valor: dados.valor,
        parcelas: dados.parcelas,
      });
    }

    var contrato = await Contrato.findOne({
      where: { colaborador_id: pedido.colaborador_id },
      order: [["data_inicio", "DESC"]],
    });
    var creditosAtivos = await Credito.findAll({
      where: { colaborador_id: pedido.colaborador_id, estado: "Ativo" },
      attributes: ["valor", "valor_pago", "motivo"],
    });
    // O crédito gerado por este próprio pedido não conta como saldo anterior.
    var saldoAtual = creditosAtivos.filter(function (c) {
      return !String(c.motivo || "").includes(pedido.id);
    }).reduce(function (total, c) {
      return total + Math.max(0, Number(c.valor || 0) - Number(c.valor_pago || 0));
    }, 0);
    var salarioBase = contrato ? Number(contrato.salario_base || 0) : Number(elegibilidade.salario_liquido || 0);
    var prestacao = Number(dados.prestacao_mensal || elegibilidade.prestacao_mensal || 0);
    var parcelas = parseInt(dados.parcelas || elegibilidade.parcelas || 0, 10);
    var montante = Number(dados.valor || elegibilidade.valor_solicitado || 0);

    var nomeArquivo = "RH-FORM-01-2026-" +
      String((pedido.colaborador && pedido.colaborador.numero_colaborador) || "colaborador")
        .replace(/[^A-Za-z0-9-]/g, "") + ".pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=\"" + nomeArquivo + "\"");
    res.setHeader("Cache-Control", "no-store");

    var doc = new PDFDocument({ size: "A4", margin: MARGEM, bufferPages: true });
    doc.pipe(res);

    // Cabecalho do formulario
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#111111")
      .text("ANEXO I — FICHA DE SOLICITAÇÃO DE CRÉDITO", MARGEM, 28, { width: LARGURA, align: "center" });
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#444444")
      .text("INTERNO REF: KSCP  |  RH-FORM-01/2026", MARGEM, 44, { width: LARGURA, align: "center" });
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
    linhaTabela(doc, ["ABRANGÊNCIA / UNIDADE", "GRUPO PROFISSIONAL / FUNÇÃO", "REPORTAR A (COORDENAÇÃO)"], larguras3, 105, 13, ["bold", "bold", "bold"]);
    linhaTabela(doc, [
      (pedido.colaborador && pedido.colaborador.unidade_negocio) || "—",
      (contrato && contrato.funcao) || "—",
      "—",
    ], larguras3, 118, 18);
    doc.font("Helvetica").fontSize(6.5).fillColor("#555555")
      .text("[ ] UN-01   [ ] UN-02   [ ] UN-03   [ ] UN-04", MARGEM, 139, { width: LARGURA });

    // 2. Solicitacao
    seccao(doc, "2", "Dados da Solicitação e Plano de Amortização", 153);
    var larguras5 = [120, 75, 120, 90, LARGURA - 405];
    linhaTabela(doc, ["MONTANTE SOLICITADO (KZ)", "N.º DE PARCELAS", "PRESTAÇÃO MENSAL (KZ)", "MÊS DE INÍCIO", "DESCONTO"], larguras5, 165, 13, ["bold", "bold", "bold", "bold", "bold"]);
    linhaTabela(doc, [
      formatarMoeda(montante),
      parcelas,
      formatarMoeda(prestacao),
      "___/______",
      "FOLHA",
    ], larguras5, 178, 18);
    campoComValor(doc, "FINALIDADE / JUSTIFICAÇÃO DO PEDIDO", pedido.descricao || pedido.titulo || "—", MARGEM, 199, LARGURA, 30);

    // 3. Validacao tecnica
    seccao(doc, "3", "Validação Técnica de Elegibilidade (Preenchimento Exclusivo RH — Capítulo 1)", 237);
    var largurasCrit = [235, 170, 110];
    linhaTabela(doc, ["CRITÉRIO NORMATIVO", "APURAMENTO SGHR", "CONFORMIDADE"], largurasCrit, 249, 13, ["bold", "bold", "bold"]);

    var conformidade = function (ok) {
      return (ok ? "[x] Sim  [ ] Não" : "[ ] Sim  [x] Não");
    };
    var linhas = [
      [
        "Antiguidade mínima de 12 meses (contrato efetivo)",
        "Admissão: " + formatarData(elegibilidade.data_admissao) + " (" + elegibilidade.meses_servico + " meses)",
        conformidade(elegibilidade.meses_servico >= 12),
      ],
      [
        "Montante solicitado <= 100% do Salário Base",
        "Salário Base: Kz " + formatarMoeda(salarioBase),
        conformidade(montante <= salarioBase),
      ],
      [
        "Prestação mensal < 30% do Salário Líquido",
        "Teto 30%: Kz " + formatarMoeda(elegibilidade.limite_mensal),
        conformidade(prestacao <= elegibilidade.limite_mensal),
      ],
      [
        "Ausência de saldo devedor ativo ou sanção disciplinar",
        "Saldo Atual: Kz " + formatarMoeda(saldoAtual),
        conformidade(saldoAtual === 0),
      ],
      [
        "Assiduidade (0 faltas injust. e <= 2 atrasos em 60 dias)",
        "Faltas: " + elegibilidade.faltas_60d + "  |  Atrasos: " + elegibilidade.atrasos_60d,
        conformidade(elegibilidade.faltas_60d === 0 && elegibilidade.atrasos_60d <= 2),
      ],
    ];
    var yCrit = 262;
    linhas.forEach(function (linha) {
      linhaTabela(doc, linha, largurasCrit, yCrit, 22);
      yCrit += 22;
    });

    // 4. Termo de compromisso
    seccao(doc, "4", "TERMO DE COMPROMISSO E AUTORIZAÇÃO DE DESCONTO EM FOLHA:", yCrit + 6);
    var termo = "Declaro que as informações prestadas são verdadeiras e autorizo expressamente a proceder ao " +
      "desconto mensal das parcelas acima discriminadas diretamente no meu vencimento, nos termos do " +
      "Capítulo I do Manual de Normas e Conduta Interna. Em caso de cessação do contrato de trabalho por " +
      "qualquer motivo antes da liquidação total, autorizo a compensação imediata do saldo remanescente " +
      "nos créditos salariais e rescisórios a que tenha direito.";
    doc.font("Helvetica").fontSize(7.5).fillColor("#222222")
      .text(termo, MARGEM + 2, yCrit + 20, { width: LARGURA - 4, align: "justify" });
    var yAssinatura = yCrit + 62;
    campoComValor(doc, "ASSINATURA DO COLABORADOR", "", MARGEM, yAssinatura, LARGURA / 2, 26);
    campoComValor(doc, "CONFERÊNCIA RECURSOS HUMANOS (SGHR)", "", MARGEM + LARGURA / 2, yAssinatura, LARGURA / 2, 26);
    doc.font("Helvetica").fontSize(7).fillColor("#333333")
      .text("Data: __ / __ / ______", MARGEM + 2, yAssinatura + 29, { width: LARGURA / 2 - 4 })
      .text("Data: __ / __ / ______", MARGEM + LARGURA / 2 + 2, yAssinatura + 29, { width: LARGURA / 2 - 4 });

    // 5. Despacho final
    seccao(doc, "5", "DESPACHO FINAL DA GERÊNCIA (PRAZO ATÉ 72H)", yAssinatura + 48);
    var yDespacho = yAssinatura + 60;
    var decisaoAprovado = pedido.estado === "aprovado" ? "[x]" : "[  ]";
    var decisaoRecusado = pedido.estado === "rejeitado" ? "[x]" : "[  ]";
    campoComValor(doc, "DECISÃO", decisaoAprovado + " APROVADO     " + decisaoRecusado + " RECUSADO   (Motivo: ________________________________)", MARGEM, yDespacho, LARGURA, 26);
    campoComValor(doc, "ASSINATURA E CARIMBO DA GERÊNCIA", "", MARGEM, yDespacho + 29, LARGURA * 0.7, 26);
    campoComValor(doc, "DATA", "__ / __ / ______", MARGEM + LARGURA * 0.7, yDespacho + 29, LARGURA * 0.3, 26);

    // Rodape do formulario
    doc.font("Helvetica-Bold").fontSize(6.5).fillColor("#333333")
      .text(
        "GRUPO KAMATAMBU — OFICINA DE ARTES GRÁFICAS  |  GAVETA 1 (GERÊNCIA)  REF: KSCP  |  MAN-RH-01/2026 — Pág. 5 de 7",
        MARGEM, 800, { width: LARGURA, align: "center" }
      );

    doc.end();
  } catch (e) {
    console.log("Erro ao gerar ficha de crédito:", e.message);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Erro ao gerar a ficha de crédito" });
    }
    res.end();
  }
};

module.exports = { gerarFichaCredito };
