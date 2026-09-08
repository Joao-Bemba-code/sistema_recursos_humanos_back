var PDFDocument = require("pdfkit");
var path = require("path");
var fs = require("fs");
var os = require("os");
var { Vencimento, Pagamento, Colaborador, Contrato, Organizacao } = require("../models");
var { listarPagamentosParaResumo } = require("./folhaSalarialController");

var MESES = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmt(val) {
  var n = parseFloat(val) || 0;
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return "—";
  var dt = new Date(d + "T00:00:00");
  return dt.getDate() + " de " + MESES[dt.getMonth()] + " de " + dt.getFullYear();
}

async function getOrganizacao(colab) {
  if (colab && colab.organizacao_id) {
    return await Organizacao.findByPk(colab.organizacao_id);
  }
  return null;
}



function drawFooter(doc, org) {
  var orgNome = org ? org.nome : "SGHR";
  var y = doc.page.height - 40;
  doc.fontSize(8).fillColor("#999999")
    .text(orgNome + " | Documento gerado pelo sistema SGHR", 40, y, { align: "center", width: doc.page.width - 80 });
  doc.fillColor("#000000");
}

function drawLogo(doc, org, x, y, maxW, maxH) {
  if (!org || !org.logo_url) return false;
  try {
    var logoPath = org.logo_url;
    if (logoPath.startsWith("/uploads/")) {
      logoPath = path.join(__dirname, "..", logoPath);
    }
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, x, y, { fit: [maxW, maxH] });
      return true;
    }
  } catch (e) {
    // logo error silently ignored
  }
  return false;
}

function addLine(doc, y) {
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).strokeColor("#e0e0e0").lineWidth(0.5).stroke();
  doc.strokeColor("#000000");
}

function decodeHtmlEntities(str) {
  if (!str) return "";
  var entities = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#34;": '"', "&#x27;": "'",
    "&apos;": "'", "&#x2F;": "/", "&#47;": "/",
    "&nbsp;": " ", "&Agrave;": "À", "&Aacute;": "Á",
    "&Acirc;": "Â", "&Atilde;": "Ã", "&Auml;": "Ä",
    "&Egrave;": "È", "&Eacute;": "É", "&Ecirc;": "Ê",
    "&Euml;": "Ë", "&Igrave;": "Ì", "&Iacute;": "Í",
    "&Icirc;": "Î", "&Iuml;": "Ï", "&Ograve;": "Ò",
    "&Oacute;": "Ó", "&Ocirc;": "Ô", "&Otilde;": "Õ",
    "&Ouml;": "Ö", "&Ugrave;": "Ù", "&Uacute;": "Ú",
    "&Ucirc;": "Û", "&Uuml;": "Ü", "&Ccedil;": "Ç",
    "&ccedil;": "ç", "&agrave;": "à", "&aacute;": "á",
    "&acirc;": "â", "&atilde;": "ã", "&auml;": "ä",
    "&egrave;": "è", "&eacute;": "é", "&ecirc;": "ê",
    "&euml;": "ë", "&igrave;": "ì", "&iacute;": "í",
    "&icirc;": "î", "&iuml;": "ï", "&ograve;": "ò",
    "&oacute;": "ó", "&ocirc;": "ô", "&otilde;": "õ",
    "&ouml;": "ö", "&ugrave;": "ù", "&uacute;": "ú",
    "&ucirc;": "û", "&uuml;": "ü",
  };
  var result = str;
  var keys = Object.keys(entities);
  for (var pass = 0; pass < 3; pass++) {
    var changed = false;
    var prev = result;
    for (var i = 0; i < keys.length; i++) {
      result = result.split(keys[i]).join(entities[keys[i]]);
    }
    result = result.replace(/&#(\d+);/g, function (m, code) {
      return String.fromCharCode(parseInt(code, 10));
    });
    result = result.replace(/&#x([0-9a-fA-F]+);/g, function (m, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    });
    if (result === prev) break;
  }
  return result;
}

function htmlToParagraphs(str) {
  if (!str) return "";
  var result = str;
  result = result.replace(/<br\s*\/?\s*>/gi, "\n");
  result = result.replace(/<\/p>/gi, "\n\n");
  result = result.replace(/<\/div>/gi, "\n\n");
  result = result.replace(/<\/li>/gi, "\n");
  result = result.replace(/<\/(h[1-6]|section|article)>/gi, "\n\n");
  result = result.replace(/<(p|div|ul|ol|li|h[1-6]|section|article)\b[^>]*>/gi, "");
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/[ \t]+\n/g, "\n");
  return result;
}

function stripHtmlTags(str) {
  if (!str) return "";
  return str.replace(/<[^>]*>/g, "").trim();
}

function stripGarbageChars(str) {
  if (!str) return "";
  var result = "";
  for (var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13) {
      result += str[i];
    } else if (code >= 32 && code <= 126) {
      result += str[i];
    } else if ((code >= 192 && code <= 255) || code === 8211 || code === 8212 || code === 8216 || code === 8217 || code === 8220 || code === 8221 || code === 8226 || code === 8364) {
      result += str[i];
    }
  }
  return result;
}

function cleanGarbledFragments(str) {
  if (!str) return "";
  var result = str;
  result = result.replace(/[™®©]+/g, "");
  result = result.replace(/["""]{2,}/g, '"');
  result = result.replace(/["']\s*[A-Z]{1,3}[Æœ]+[^a-zA-Z]*/g, "");
  result = result.replace(/[ÆŒ]{2,}[^a-zA-Z]*/g, "");
  result = result.replace(/[÷§«»]+/g, "");
  result = result.replace(/\t+/g, " ");
  result = result.replace(/ {3,}/g, "  ");
  result = result.replace(/[""'"][A-Z]?[ÆŒÂÃ]+[A-Z]?[ÆŒÂÃ]+[A-Z]?[ÆŒ]+[^\n]*/g, "");
  result = result.replace(/[–—]{2,}[^\n]*/g, "");
  result = result.replace(/[òôõöùúûüýÿ]+[^\n]{0,5}[òôõöùúûüýÿ]+/g, "");
  result = result.replace(/^\s*["""]\s*[A-Z][^\n]*[Æœ][^\n]*/gm, "");
  result = result.replace(/[^\x00-\x7F]{3,}/g, "");
  return result;
}

function normalizeForPdf(str) {
  if (!str) return "";
  var result = decodeHtmlEntities(str);
  result = htmlToParagraphs(result);
  result = stripHtmlTags(result);
  result = stripGarbageChars(result);
  result = cleanGarbledFragments(result);
  return result;
}

function replacePlaceholders(template, vars) {
  var result = template;
  var keys = Object.keys(vars);
  for (var i = 0; i < keys.length; i++) {
    var regex = new RegExp("\\{" + keys[i] + "\\}", "g");
    result = result.replace(regex, vars[keys[i]] || "");
  }
  result = result.replace(/\(nome completo\)/gi, vars["NOME_COLABORADOR"] || "");
  result = result.replace(/\(estado civil\)/gi, vars["ESTADO_CIVIL"] || "");
  result = result.replace(/\(______\)/g, vars["SALARIO_BASE"] || "");
  result = result.replace(/\( ___\)/g, vars["HORARIO_TRABALHO"] || "");
  result = result.replace(/\(_____________\)/g, vars["CATEGORIA_PROFISSIONAL"] || "");
  result = result.replace(/\( ?______\)/g, vars["DATA_INICIO"] || "");
  result = result.replace(/\(__\)/g, "");
  result = result.replace(/\(kz[.…]+\)/gi, "");
  result = result.replace(/NIF[.…]+/g, "NIF " + (vars["NIF_COLABORADOR"] || ""));
  result = result.replace(/n[úu]mero[.…]+/gi, "n[úu]mero " + (vars["BI_COLABORADOR"] || ""));
  result = result.replace(/…+/g, "");
  result = result.replace(/\.\.\.+/g, "");
  return result;
}

// ==================== FOLHA SALARIAL PDF ====================

exports.folhaSalarial = async function (req, res) {
  try {
    var { id } = req.params;
    var pagamento = await Pagamento.findByPk(id, {
      include: [{ model: Colaborador, as: "colaborador" }],
    });
    if (!pagamento) {
      return res.status(404).json({ error: "Pagamento nao encontrado" });
    }

    var colab = pagamento.colaborador;
    var org = await getOrganizacao(colab);

    var doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=recibo_vencimento_" + (colab ? colab.numero_colaborador : "") + ".pdf");
    doc.pipe(res);

    var ml = 40;
    var w = doc.page.width - 80;
    var pw = doc.page.width;
    var col1 = 50;
    var colV = pw - 60;
    var valW = 200;
    var rowH = 18;
    var y = 42;

    if (org && org.logo_url) {
      try {
        var logoPath = org.logo_url;
        if (logoPath.startsWith("/uploads/")) { logoPath = path.join(__dirname, "..", logoPath); }
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, pw / 2 - 35, y, { fit: [70, 70] });
          y += 78;
        }
      } catch (e) {}
    }

    if (org && org.nome) {
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000");
      doc.text(normalizeForPdf(org.nome), ml, y, { align: "center", width: w });
      y += 24;
    }

    doc.font("Helvetica-Bold").fontSize(14).fillColor("#1a1a1a");
    doc.text("Recibo de Vencimento", ml, y, { align: "center", width: w });
    y += 22;

    doc.font("Helvetica").fontSize(10).fillColor("#666666");
    doc.text("Mes de " + MESES[pagamento.mes - 1] + " de " + pagamento.ano, ml, y, { align: "center", width: w });
    y += 18;

    y += 8;

    function reciboRow(label, value) {
      doc.font("Helvetica").fontSize(10).fillColor("#000000");
      doc.text(label, col1, y);
      doc.text(value, colV - valW, y, { align: "right", width: valW });
      y += rowH;
    }

    function reciboTotalRow(label, value) {
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#333333");
      doc.text(label, col1, y);
      doc.text(value, colV - valW, y, { align: "right", width: valW });
      y += rowH + 6;
    }

    if (colab) {
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#000000");
      doc.text("Dados do Colaborador", ml, y);
      y += 16;
      doc.font("Helvetica").fontSize(10).fillColor("#333333");
      doc.text("Nome: " + normalizeForPdf(colab.nome_completo), ml, y); y += 15;
      doc.text("N. Colaborador: " + normalizeForPdf(colab.numero_colaborador), ml, y); y += 15;
      if (colab.nif) { doc.text("NIF: " + normalizeForPdf(colab.nif), ml, y); y += 15; }
      if (colab.numero_seguranca_social) { doc.text("N. Seguranca Social: " + normalizeForPdf(colab.numero_seguranca_social), ml, y); y += 15; }
      if (colab.conta_bancaria) { doc.text("Conta Bancaria: " + normalizeForPdf(colab.conta_bancaria), ml, y); y += 15; }
      y += 8;
    }

    y += 8;

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#000000");
    doc.text("Detalhes do Vencimento", ml, y);
    y += 16;

    doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333");
    doc.text("Descricao", col1, y);
    doc.text("Valores", colV - valW, y, { align: "right", width: valW });
    y += rowH;
    doc.fillColor("#000000").font("Helvetica");

    doc.font("Helvetica-Bold").fillColor("#333333").text("VENCIMENTOS", col1, y); y += rowH;

    var totalVencimentos = (parseFloat(pagamento.salario_base) || 0) + (parseFloat(pagamento.subsidios) || 0) + (parseFloat(pagamento.horas_extras) || 0);

    var vals = [
      ["  Salario Base", pagamento.salario_base],
      ["  Subsidios", pagamento.subsidios],
      ["  Horas Extras", pagamento.horas_extras],
    ];

    for (var i = 0; i < vals.length; i++) {
      var v = parseFloat(vals[i][1]) || 0;
      if (v > 0) { reciboRow(vals[i][0], fmt(v) + " Kz"); }
    }
    y += 4;
    reciboTotalRow("Total Vencimentos", fmt(totalVencimentos) + " Kz");

    doc.font("Helvetica-Bold").fillColor("#333333").text("DESCONTOS", col1, y); y += rowH;

    var descontos = [
      ["  IRT", pagamento.irt],
      ["  Seguranca Social", pagamento.seguranca_social],
      ["  Outros Descontos", pagamento.descontos],
      ["  Desconto Faltas", pagamento.desconto_faltas],
    ];

    for (var j = 0; j < descontos.length; j++) {
      var dv = parseFloat(descontos[j][1]) || 0;
      if (dv > 0) { reciboRow(descontos[j][0], "- " + fmt(dv) + " Kz"); }
    }
    y += 4;

    var totalDescontos = (parseFloat(pagamento.irt) || 0) + (parseFloat(pagamento.seguranca_social) || 0) + (parseFloat(pagamento.descontos) || 0) + (parseFloat(pagamento.desconto_faltas) || 0);
    reciboTotalRow("Total Descontos", "- " + fmt(totalDescontos) + " Kz");

    y += 4;
    var ly = y;
    doc.rect(40, ly - 6, pw - 80, 24).fill("#eef2f7");
    doc.fillColor("#111111").font("Helvetica-Bold").fontSize(13);
    doc.text("TOTAL LIQUIDO A RECEBER", col1, ly);
    doc.text(fmt(pagamento.total_liquido) + " Kz", colV - valW, ly, { align: "right", width: valW });
    y = ly + 24;

    doc.fontSize(9).font("Helvetica").fillColor("#666666");
    doc.text("Estado: " + pagamento.estado, ml, y); y += 15;
    if (pagamento.data_pagamento) {
      doc.text("Data de Pagamento: " + fmtDate(pagamento.data_pagamento), ml, y); y += 15;
    }
    doc.text("Periodo: " + MESES[pagamento.mes - 1] + " / " + pagamento.ano, ml, y); y += 20;

    drawFooter(doc, org);
    doc.end();
  } catch (e) {
    console.log("Erro ao gerar PDF folha salarial:", e.message);
    return res.status(500).json({ error: "Erro ao gerar PDF" });
  }
};

// ==================== CONTRATO PDF ====================

exports.contrato = async function (req, res) {
  try {
    var { id } = req.params;
    var contrato = await Contrato.findByPk(id, {
      include: [{ model: Colaborador, as: "colaborador" }],
    });
    if (!contrato) {
      return res.status(404).json({ error: "Contrato nao encontrado" });
    }

    var colab = contrato.colaborador;
    var org = await getOrganizacao(colab);

    var doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=contrato_trabalho_" + (colab ? colab.numero_colaborador : "") + ".pdf");
    doc.pipe(res);

    // Logo at top center
    var y = 50;
    var ml = 50;
    var w = doc.page.width - 100;
    var pw = doc.page.width;
    var logoHeight = 0;

    if (org && org.logo_url) {
      try {
        var logoPath = org.logo_url;
        if (logoPath.startsWith("/uploads/")) {
          logoPath = path.join(__dirname, "..", logoPath);
        }
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, pw / 2 - 40, y, { fit: [80, 80] });
          logoHeight = 90;
        }
      } catch (e) {}
    }

    y += logoHeight;

    // Organization name
    if (org && org.nome) {
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000");
      doc.text(org.nome, ml, y, { align: "center", width: w });
      y += 20;
    }

    // Contract title
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#000000");
    doc.text("CONTRATO DE TRABALHO", ml, y, { align: "center", width: w });
    y += 20;

    // Contract ref and type
    doc.font("Helvetica").fontSize(9).fillColor("#333333");
    doc.text("Ref: " + contrato.numero + " | " + contrato.tipo.replace("_", " "), ml, y, { align: "center", width: w });
    y += 20;

    // Line separator
    addLine(doc, y); y += 15;

    // Se a organizacao tem template, usar template com placeholders
    if (org && org.template_contrato) {
      var placeholders = {
        "NOME_COLABORADOR": colab ? colab.nome_completo : "",
        "NUMERO_COLABORADOR": colab ? colab.numero_colaborador : "",
        "NIF_COLABORADOR": colab ? (colab.nif || "") : "",
        "BI_COLABORADOR": colab ? (colab.bi || "") : "",
        "ESTADO_CIVIL": colab ? (colab.estado_civil || "") : "",
        "NATURAL_DE": colab ? ((colab.cidade || "") + (colab.provincia ? ", " + colab.provincia : "")) : "",
        "RESIDENCIA": colab ? (colab.endereco || "") : "",
        "EMAIL_COLABORADOR": colab ? (colab.email_institucional || colab.email_pessoal || "") : "",
        "TELEFONE_COLABORADOR": colab ? (colab.telefone || "") : "",
        "NUMERO_CONTRATO": contrato.numero || "",
        "TIPO_CONTRATO": contrato.tipo ? contrato.tipo.replace("_", " ") : "",
        "DATA_INICIO": fmtDate(contrato.data_inicio),
        "DATA_FIM": contrato.data_fim ? fmtDate(contrato.data_fim) : "",
        "DATA_ASSINATURA": contrato.data_assinatura ? fmtDate(contrato.data_assinatura) : fmtDate(contrato.data_inicio),
        "CATEGORIA_PROFISSIONAL": contrato.funcao || "",
        "LOCAL_TRABALHO": contrato.local_trabalho || "",
        "HORARIO_TRABALHO": contrato.horario_trabalho || "",
        "SALARIO_BASE": contrato.salario_base ? fmt(contrato.salario_base) + " " + contrato.moeda : "",
        "SUBSIDIO_ALIMENTACAO": contrato.subsidio_alimentacao ? fmt(contrato.subsidio_alimentacao) + " " + (contrato.moeda || "AOA") : "",
        "PERIODO_EXPERIMENTACAO": contrato.periodo_experimentacao ? contrato.periodo_experimentacao + " dias" : "",
        "NOME_ORGANIZACAO": org ? org.nome : "",
        "NIF_ORGANIZACAO": org ? (org.nif || "") : "",
        "MORADA_ORGANIZACAO": org ? (org.endereco || "") : "",
        "CIDADE_ORGANIZACAO": org ? (org.cidade || "") : "",
        "PROVINCIA_ORGANIZACAO": org ? (org.provincia || "") : "",
        "PAIS_ORGANIZACAO": org ? (org.pais || "Angola") : "",
      };

      var templateTexto = normalizeForPdf(replacePlaceholders(org.template_contrato, placeholders));

      // Draw template text line by line
      var linhas = templateTexto.split("\n");
      doc.font("Helvetica").fontSize(9).fillColor("#333333");
      var aguardarNomeClausula = false;

      for (var t = 0; t < linhas.length; t++) {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        var linha = (linhas[t] || "").trim();
        if (linha === "") {
          aguardarNomeClausula = false;
          y += 5;
          continue;
        }

        // Check if line is a section title (starts with CLAUSULA or similar uppercase)
        var isTitle = linha.match(/^(CLAUSULA|CLÁUSULA|ARTIGO|SECCAO|SECÇÃO|TITULO|CAPITULO|CAPÍTULO)/i);
        if (isTitle) {
          y += 6;
          doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333");
          doc.text(linha, ml, y, { width: w });
          y = doc.y + 5;
          doc.font("Helvetica").fontSize(9).fillColor("#333333");
          aguardarNomeClausula = true;
          continue;
        }

        // Next line after a clause title is the clause name -> bold subtitle
        if (aguardarNomeClausula) {
          aguardarNomeClausula = false;
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#444444");
          doc.text(linha, ml, y, { width: w });
          y = doc.y + 4;
          doc.font("Helvetica").fontSize(9).fillColor("#333333");
          continue;
        }

        // List items: "1. ...", "2. ..." or "a) ...", "b) ..."
        var isLista = linha.match(/^(\d+\.\s|[a-z]\)\s)/i);
        if (isLista) {
          doc.text(linha, ml, y, { width: w, align: "left", indent: 16, hangingIndent: 16, lineGap: 2 });
          y = doc.y + 4;
          continue;
        }

        // Normal paragraph with first-line indent
        doc.font("Helvetica").fontSize(9).fillColor("#333333");
        doc.text(linha, ml, y, { width: w, align: "justify", indent: 18, lineGap: 2 });
        y = doc.y + 5;
      }

      // Assinaturas no final do template
      y += 20;
      if (y > 620) {
        doc.addPage();
        y = 100;
      }

      addLine(doc, y); y += 20;
      doc.font("Helvetica").fontSize(9).fillColor("#333333");
      doc.text("Feito em duplicado, ambos com valor de original.", ml, y, { align: "center", width: w });
      y += 20;
      doc.text(fmtDate(contrato.data_assinatura || contrato.data_inicio), ml, y, { align: "center", width: w });
      y += 40;

      doc.moveTo(ml + 30, y).lineTo(ml + 220, y).strokeColor("#999999").lineWidth(0.5).stroke();
      doc.moveTo(pw - ml - 220, y).lineTo(pw - ml - 30, y).stroke();
      y += 8;
      doc.strokeColor("#000000");
      doc.font("Helvetica").fontSize(8).fillColor("#666666");
      doc.text(org ? org.nome : "Entidade Empregadora", ml + 30, y, { width: 190, align: "center" });
      doc.text("Trabalhador", pw - ml - 220, y, { width: 190, align: "center" });

    } else {
      // Sem template — usar modelo padrao com dados da organizacao
      doc.fontSize(9).font("Helvetica").fillColor("#333333");
      doc.text("Data de Inicio: " + fmtDate(contrato.data_inicio), ml, y);
      y += 14;
      if (contrato.data_fim) {
        doc.text("Data de Fim: " + fmtDate(contrato.data_fim), ml, y);
        y += 14;
      }
      if (contrato.data_assinatura) {
        doc.text("Data de Assinatura: " + fmtDate(contrato.data_assinatura), ml, y);
        y += 14;
      }
      y += 6;
      addLine(doc, y); y += 12;

      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(10);
      if (contrato.funcao) {
        doc.text("Categoria Profissional: " + contrato.funcao, ml, y);
        y += 16;
      }
      if (contrato.local_trabalho) {
        doc.text("Local de Trabalho: " + contrato.local_trabalho, ml, y);
        y += 16;
      }
      if (contrato.horario_trabalho) {
        doc.text("Horario de Trabalho: " + contrato.horario_trabalho, ml, y);
        y += 16;
      }
      doc.text("Salario Base: " + fmt(contrato.salario_base) + " " + contrato.moeda, ml, y);
      y += 16;
      if (contrato.periodo_experimentacao) {
        doc.text("Periodo de Experimentacao: " + contrato.periodo_experimentacao + " dias", ml, y);
        y += 16;
      }

      y += 6;
      addLine(doc, y); y += 14;

      // Dados da Entidade
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#333333");
      doc.text("ENTIDADE EMPREGADORA", ml, y);
      y += 18;
      doc.font("Helvetica").fontSize(9).fillColor("#333333");
      doc.text("Denominacao: " + (org ? org.nome : "—"), ml, y); y += 14;
      doc.text("NIF: " + (org ? (org.nif || "—") : "—"), ml, y); y += 14;
      doc.text("Sede: " + (org ? ((org.endereco || "") + ", " + (org.cidade || "") + ", " + (org.pais || "Angola")) : "—"), ml, y); y += 20;

      // Dados do Trabalhador
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#333333");
      doc.text("TRABALHADOR", ml, y);
      y += 18;
      doc.font("Helvetica").fontSize(9).fillColor("#333333");

      if (colab) {
        doc.text("Nome Completo: " + colab.nome_completo, ml, y); y += 14;
        doc.text("N. Colaborador: " + colab.numero_colaborador, ml, y); y += 14;
        if (colab.nif) { doc.text("NIF: " + colab.nif, ml, y); y += 14; }
        if (colab.bi) { doc.text("Bilhete de Identidade: " + colab.bi, ml, y); y += 14; }
        if (colab.estado_civil) { doc.text("Estado Civil: " + colab.estado_civil, ml, y); y += 14; }
        if (colab.endereco) { doc.text("Residencia: " + colab.endereco, ml, y); y += 14; }
      }

      y += 10;
      addLine(doc, y); y += 14;

      // Clausulas padrao
      function drawClausula(titulo, texto) {
        if (y > 680) { doc.addPage(); y = 50; }
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333");
        doc.text(titulo, ml, y);
        y += 16;
        doc.font("Helvetica").fontSize(9).fillColor("#333333");
        doc.text(texto, ml, y, { width: w, align: "justify", lineGap: 2 });
        y = doc.y + 14;
      }

      drawClausula("CLÁUSULA PRIMEIRA - Categoria Profissional",
        "A Entidade Empregadora admite ao seu servico o trabalhador com a categoria profissional de " + (contrato.funcao || "a definir") + ", ficando este sob autoridade e direccao da Entidade Empregadora.");

      drawClausula("CLÁUSULA SEGUNDA - Duracao",
        "O presente contrato tem inicio em " + fmtDate(contrato.data_inicio) +
        (contrato.data_fim ? " e termina em " + fmtDate(contrato.data_fim) + "." : " e vigora por tempo indeterminado.") +
        (contrato.periodo_experimentacao ? " O periodo de experimentacao e de " + contrato.periodo_experimentacao + " dias." : ""));

      drawClausula("CLÁUSULA TERCEIRA - Local de Trabalho",
        "O local de prestacao de trabalho sera no estabelecimento da Entidade Empregadora, " + (contrato.local_trabalho || "sede da empresa") + ", ou noutro que venha a possuir, arrendar ou explorar.");

      drawClausula("CLÁUSULA QUARTA - Horario de Trabalho",
        "O trabalhador obriga-se a prestar " + (contrato.horario_trabalho || "40 horas semanais") + " de trabalho, com intervalo para refeicao.");

      drawClausula("CLÁUSULA QUINTA - Retribuicao",
        "A Entidade Empregadora compromete-se a pagar ao trabalhador a retribuicao mensal de " + fmt(contrato.salario_base) + " " + contrato.moeda + ", sujeita aos descontos legais e paga 12 meses por ano, acrescida de duodecimos de subsidio de natal e de ferias calculados nos termos da lei." +
        (contrato.subsidio_alimentacao ? " O trabalhador tera ainda direito ao valor de " + fmt(contrato.subsidio_alimentacao) + " " + contrato.moeda + " referente ao subsidio de alimentacao por cada dia de trabalho efectivo, nao sendo este valor considerado para efeitos de calculo dos duodecimos previstos no numero anterior." : ""));

      drawClausula("CLÁUSULA SEXTA - Deveres do Trabalhador",
        "O trabalhador obriga-se a: a) Comparecer ao servico com assiduidade; b) Cumprir pontualmente o horario de trabalho; c) Guardar sigilo absoluto em todos os assuntos da Entidade Empregadora; d) Guardar lealdade a Entidade Empregadora.");

      drawClausula("CLÁUSULA SETIMA - Confidencialidade",
        "As partes acordam atribuir confidencialidade a toda e qualquer informacao decorrente do presente contrato.");

      drawClausula("CLÁUSULA OITAVA - Disposicoes Finais",
        "Ambas as partes se obrigam ao integral cumprimento do acordado no presente contrato.");

      y += 10;
      if (y > 620) { doc.addPage(); y = 100; }

      drawFooter(doc, org);
      addLine(doc, y); y += 20;
      doc.font("Helvetica").fontSize(9).fillColor("#333333");
      doc.text("Feito em duplicado, ambos com valor de original.", ml, y, { align: "center", width: w });
      y += 20;
      doc.text(fmtDate(contrato.data_assinatura || contrato.data_inicio), ml, y, { align: "center", width: w });
      y += 40;

      doc.moveTo(ml + 30, y).lineTo(ml + 220, y).strokeColor("#999999").lineWidth(0.5).stroke();
      doc.moveTo(pw - ml - 220, y).lineTo(pw - ml - 30, y).stroke();
      y += 8;
      doc.strokeColor("#000000");
      doc.font("Helvetica").fontSize(8).fillColor("#666666");
      doc.text(org ? org.nome : "Entidade Empregadora", ml + 30, y, { width: 190, align: "center" });
      doc.text("Trabalhador", pw - ml - 220, y, { width: 190, align: "center" });
    }

    doc.end();
  } catch (e) {
    console.log("Erro ao gerar PDF contrato:", e.message);
    return res.status(500).json({ error: "Erro ao gerar PDF" });
  }
};

// ==================== AVISO/ADVERTÊNCIA PDF ====================

function getDataAtual() {
  var d = new Date();
  var dias = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  var diaSemana = dias[d.getDay()];
  var dia = d.getDate();
  var mes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][d.getMonth()];
  var ano = d.getFullYear();
  return diaSemana + ", " + dia + " de " + mes + " de " + ano;
}

function drawWarningHeader(doc, org, y) {
  var ml = 40;
  var w = doc.page.width - 80;

  // Nome da organização (falha para RHKAMATAMBU quando não houver dados)
  var nomeOrg = (org && org.nome) ? org.nome : "RHKAMATAMBU";
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#1a1a1a");
  doc.text(normalizeForPdf(nomeOrg), ml, y, { width: w, align: "center" });
  y = doc.y + 6;

  // Contactos da organização (quando existirem)
  var infoOrg = [];
  if (org && org.endereco) infoOrg.push(normalizeForPdf(org.endereco));
  if (org && org.cidade) infoOrg.push(normalizeForPdf(org.cidade));
  if (org && org.nif) infoOrg.push("NIF: " + org.nif);
  if (infoOrg.length > 0) {
    doc.font("Helvetica").fontSize(9).fillColor("#555555");
    doc.text(infoOrg.join("  |  "), ml, y, { width: w, align: "center" });
    y = doc.y + 6;
  }

  addLine(doc, y); y = doc.y + 20;

  // Título do documento
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#000000");
  doc.text("CARTA DE ADVERTÊNCIA", ml, y, { width: w, align: "center" });
  y = doc.y + 26;

  return y;
}

function drawWarningContent(doc, y, colab, descricao, numero) {
  var ml = 40;
  var w = doc.page.width - 80;

  // Data e local (um único bloco, sem repetição)
  var dataAtual = getDataAtual();
  doc.font("Helvetica").fontSize(10).fillColor("#333333");
  doc.text(dataAtual, ml, y, { width: w, align: "right" });
  y = doc.y + 20;

  // Referência automática da ocorrência (OD-ANO-NNNN)
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333");
  doc.text("Ref.º " + (numero || "s/n") + " — Carta de Advertência", ml, y, { width: w });
  y = doc.y + 24;

  // Saudação ao colaborador
  var nomeDest = "";
  if (colab && colab.nome_completo) {
    var partes = colab.nome_completo.trim().split(/\s+/);
    nomeDest = partes[0] + (partes.length > 1 ? " " + partes[partes.length - 1] : "");
  }
  doc.font("Helvetica").fontSize(11).fillColor("#000000");
  doc.text("Prezado(a) Sr.(a) " + (nomeDest || "Colaborador(a)") + ",", ml, y, { width: w });
  y = doc.y + 20;

  // Parágrafo de enquadramento
  var textoIndisciplina = "Tendo em vista V. Ex.ª ter cometido ato(s) de indisciplina, em violação da Cláusula oitava (8.ª) dos Deveres do Trabalhador previstos no contrato de trabalho, resolvemos aplicá-la, como medida disciplinar, a presente CARTA DE ADVERTÊNCIA, com o intuito de evitar a reincidência ou o cometimento de outra(s) falta(s) de qualquer natureza prevista em lei, que nos obrigará a tomar outras medidas cabíveis de acordo com a legislação em vigor.";
  doc.font("Helvetica").fontSize(10).fillColor("#333333").lineGap(3);
  doc.text(textoIndisciplina, ml, y, { width: w, align: "justify" });
  y = doc.y + 22;

  // Motivo da advertência (descrição da ocorrência)
  doc.font("Helvetica").fontSize(10).fillColor("#333333").lineGap(3);
  doc.text("Motivo: " + (descricao || "Não especificado."), ml, y, { width: w, align: "justify" });
  y = doc.y + 24;

  // Transcrição da cláusula
  if (y > 620) { doc.addPage(); y = 50; }
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000");
  doc.text("CLÁUSULA OITAVA — DO CONTRATO DE TRABALHO", ml, y, { width: w });
  y = doc.y + 14;

  var clausulaOitava = (
    "Deveres do trabalhador\n\n" +
    "1) O trabalhador, aceitando ser admitido ao serviço da Entidade Empregadora, obriga-se ao cumprimento dos regulamentos e determinações escritas ou resultantes das práticas internas e usuais desta, bem como do preceituado na contratação colectiva e demais legislação aplicável e, ainda, mais especificamente:\n\n" +
    "a) Comparecer ao serviço com assiduidade e realizar o trabalho com zelo e diligência, visando a melhoria da produtividade da empresa;\n\n" +
    "b) Executar todos os trabalhos com zelo e dedicação, ao serviço e no interesse da Entidade Empregadora, cumprindo estritamente as ordens e instruções dos seus superiores hierárquicos;\n\n" +
    "c) Cumprir pontualmente o seu horário de trabalho, só prestando trabalho suplementar quando tal for determinado pelos seus superiores hierárquicos competentes para o efeito e dentro dos pressupostos definidos na lei;\n\n" +
    "d) Guardar sigilo absoluto em todos os assuntos relacionados com a atividade da Entidade Empregadora, e não guardar para si ou para terceiros cópias, duplicados ou documentos daquela;\n\n" +
    "e) Não exercer fora da atividade prestada à Entidade Empregadora qualquer atividade remunerada sem que para tanto tenha autorização escrita daquela;\n\n" +
    "f) Deslocar-se ao serviço e a expensas da Entidade Empregadora, a qualquer localidade do país ou do estrangeiro, sempre que tais deslocações sejam necessárias ao exercício da atividade da primeira outorgante;\n\n" +
    "g) Guardar lealdade à Entidade Empregadora e cumprir as demais obrigações decorrentes do contrato e das normas que o regem;\n\n" +
    "h) Responsabilizar-se pela guarda e adequada utilização e conservação de todos os bens e valores que, no âmbito do presente contrato, sejam por ele recebidos e manuseados ou que, por qualquer outra forma, se encontrem à sua guarda, responsabilizando-se nos termos gerais pelo ressarcimento de quaisquer prejuízos que venha a causar direta ou indiretamente por um negligente desempenho das suas funções, nomeadamente extravio de bens e valores ou a sua danificação, sem prejuízo de um eventual procedimento disciplinar ou criminal;\n\n" +
    "i) Abster-se de ter conduta que possa prejudicar o bom nome e a imagem da Entidade Empregadora e seus representantes."
  );

  var clLines = clausulaOitava.split("\n");
  for (var c = 0; c < clLines.length; c++) {
    var clLine = clLines[c].trim();
    if (!clLine) {
      y += 8;
      continue;
    }
    if (doc.y > 735) { doc.addPage(); doc.y = 50; }
    if (clLine.match(/^\d+\)/)) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333");
    } else {
      doc.font("Helvetica").fontSize(10).fillColor("#333333");
    }
    doc.text(clLine, ml, doc.y, { width: w - (clLine.match(/^[a-z]\)/) ? 20 : 0), indent: clLine.match(/^[a-z]\)/) ? 20 : 0, lineGap: 3 });
  }
  y = doc.y + 26;

  // Encerramento
  doc.font("Helvetica").fontSize(10).fillColor("#333333").lineGap(3);
  doc.text("Para seu conhecimento, transcrevemos o teor da referida cláusula, que deverá ser observada de forma rigorosa. Pedimos que assine o presente aviso, comprometendo-se ao cumprimento das normas internas da instituição.", ml, y, { width: w, align: "justify" });
  y = doc.y + 40;

  // Assinaturas
  if (y > 700) { doc.addPage(); doc.y = 50; y = doc.y + 20; }
  var identGerente = "o/a Gerente";
  var nomeAssinatura = colab && colab.nome_completo ? colab.nome_completo : "o/a Colaborador(a)";
  addLine(doc, y); y = doc.y + 16;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000");
  doc.text(identGerente, ml, y, { width: 200, align: "center" });
  doc.text("Assinatura do(a) Colaborador(a)", 320, y, { width: 200, align: "center" });
  y = doc.y + 24;
  doc.font("Helvetica").fontSize(9).fillColor("#333333");
  doc.text("Data: ____/____/______", ml, y, { width: 200, align: "center" });
  doc.text(nomeAssinatura, 320, y, { width: 200, align: "center" });

  return y;
}

exports.avisoAdvertencia = async function (req, res) {
  try {
    var { colaboradorId } = req.params;

    var colab = null;
    if (colaboradorId && colaboradorId !== "null" && colaboradorId !== "undefined") {
      colab = await Colaborador.findByPk(colaboradorId, {
        include: [{ model: Organizacao, as: "organizacao" }],
      });
    }

    var org = colab ? colab.organizacao : null;

    var doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=aviso_advertencia_" + (colab ? colab.numero_colaborador : "") + ".pdf");
    doc.pipe(res);

    var y = 50;

    y = drawWarningHeader(doc, org, y);

    // Default description if none provided
    var descricao = req.query.descricao || "Abandono do posto de trabalho.";

    // Referência automática da ocorrência (OD-ANO-NNNN)
    var numero = req.query.numero || "";

    y = drawWarningContent(doc, y, colab, descricao, numero);

    doc.end();
  } catch (e) {
    console.log("Erro ao gerar PDF aviso/advertencia:", e.message);
    return res.status(500).json({ error: "Erro ao gerar PDF" });
  }
};

// ==================== FICHA COLABORADOR PDF ====================

exports.fichaColaborador = async function (req, res) {
  try {
    var { id } = req.params;
    var colab = await Colaborador.findByPk(id);
    if (!colab) {
      return res.status(404).json({ error: "Colaborador nao encontrado" });
    }

    var contrato = await Contrato.findOne({
      where: { colaborador_id: id, estado: "Activo" },
      order: [["data_inicio", "DESC"]],
    });

    var org = await getOrganizacao(colab);

    var doc = new PDFDocument({ size: "A4", margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=ficha_colaborador_" + colab.numero_colaborador + ".pdf");
    doc.pipe(res);

    var ml = 50;
    var w = doc.page.width - 100;
    var pw = doc.page.width;
    var y = 50;
    var logoHeight = 0;

    if (org && org.logo_url) {
      try {
        var logoPath = org.logo_url;
        if (logoPath.startsWith("/uploads/")) { logoPath = path.join(__dirname, "..", logoPath); }
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, pw / 2 - 40, y, { fit: [80, 80] });
          logoHeight = 90;
        }
      } catch (e) {}
    }

    y += logoHeight;

    if (org && org.nome) {
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#000000");
      doc.text(normalizeForPdf(org.nome), ml, y, { align: "center", width: w });
      y += 20;
    }

    doc.font("Helvetica-Bold").fontSize(13).fillColor("#000000");
    doc.text("Ficha do Colaborador", ml, y, { align: "center", width: w });
    y += 20;

    doc.font("Helvetica").fontSize(9).fillColor("#555555");
    doc.text(colab.numero_colaborador + " | " + normalizeForPdf(colab.nome_completo), ml, y, { align: "center", width: w });
    y += 20;

    y += 15;

    if (colab.fotografia) {
      try {
        var photoPath = decodeHtmlEntities(colab.fotografia);
        if (photoPath.startsWith("http")) {
          var https = require("https");
          var tempFile = path.join(os.tmpdir(), "sghr_photo_" + Date.now() + ".jpg");
          await new Promise(function (resolve, reject) {
            https.get(photoPath, function (response) {
              var stream = fs.createWriteStream(tempFile);
              response.pipe(stream);
              stream.on("finish", function () { stream.close(); resolve(); });
            }).on("error", reject);
          });
          if (fs.existsSync(tempFile)) {
            doc.image(tempFile, pw - 130, y - 30, { fit: [75, 95] });
            fs.unlinkSync(tempFile);
          }
        } else {
          if (photoPath.startsWith("/uploads/")) {
            photoPath = path.join(__dirname, "..", photoPath);
          }
          if (fs.existsSync(photoPath)) {
            doc.image(photoPath, pw - 130, y - 30, { fit: [75, 95] });
          }
        }
      } catch (e) {}
    }

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#333333");
    doc.text("Dados Pessoais", ml, y); y += 20;
    doc.font("Helvetica").fontSize(9).fillColor("#333333");

    var dados = [
      ["Nome Completo", normalizeForPdf(colab.nome_completo)],
      ["N. Colaborador", normalizeForPdf(colab.numero_colaborador)],
      ["Data de Nascimento", colab.data_nascimento],
      ["Genero", colab.genero === "M" ? "Masculino" : colab.genero === "F" ? "Feminino" : colab.genero],
      ["Estado Civil", normalizeForPdf(colab.estado_civil)],
      ["NIF", colab.nif],
      ["BI", colab.bi],
      ["Email Institucional", normalizeForPdf(colab.email_institucional)],
      ["Email Pessoal", normalizeForPdf(colab.email_pessoal)],
      ["Telefone", colab.telefone],
      ["Endereco", normalizeForPdf(colab.endereco)],
      ["Cidade", normalizeForPdf(colab.cidade)],
      ["Provincia", normalizeForPdf(colab.provincia)],
    ];

    for (var i = 0; i < dados.length; i++) {
      if (dados[i][1]) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333").text(dados[i][0], ml, y);
        doc.font("Helvetica").fillColor("#555555").text(dados[i][1], ml + 130, y);
        y += 14;
      }
    }

    y += 18;

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#333333");
    doc.text("Dados Profissionais", ml, y); y += 20;
    doc.font("Helvetica").fontSize(9).fillColor("#333333");

    var prof = [
      ["Tipo de Colaborador", normalizeForPdf(colab.tipo_colaborador)],
      ["Estado", colab.estado],
      ["Data de Admissao", colab.data_admissao],
      ["N. Seguranca Social", colab.numero_seguranca_social],
      ["Habilitacoes", normalizeForPdf(colab.habilitacoes)],
      ["Formacao Academica", normalizeForPdf(colab.formacao_academica)],
    ];

    for (var j = 0; j < prof.length; j++) {
      if (prof[j][1]) {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333").text(prof[j][0], ml, y);
        doc.font("Helvetica").fillColor("#555555").text(prof[j][1], ml + 130, y);
        y += 14;
      }
    }

    if (contrato) {
      y += 20;
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#333333");
      doc.text("Contrato Activo", ml, y); y += 20;
      doc.font("Helvetica").fontSize(9).fillColor("#333333");

      var ctr = [
        ["Numero", contrato.numero],
        ["Tipo", contrato.tipo.replace("_", " ")],
        ["Funcao", contrato.funcao],
        ["Salario Base", fmt(contrato.salario_base) + " " + contrato.moeda],
        ["Data de Inicio", contrato.data_inicio],
        ["Local de Trabalho", contrato.local_trabalho],
        ["Horario", contrato.horario_trabalho],
      ];

      for (var k = 0; k < ctr.length; k++) {
        if (ctr[k][1]) {
          doc.font("Helvetica-Bold").fontSize(9).fillColor("#333333").text(ctr[k][0], ml, y);
          doc.font("Helvetica").fillColor("#555555").text(ctr[k][1], ml + 130, y);
          y += 14;
        }
      }
    }

    drawFooter(doc, org);
    doc.end();
  } catch (e) {
    console.log("Erro ao gerar PDF ficha colaborador:", e.message);
    return res.status(500).json({ error: "Erro ao gerar PDF" });
  }
};

// ==================== RESUMO PAGAMENTOS PDF ====================

exports.resumoPagamentos = async function (req, res) {
  try {
    var { mes, ano } = req.query;
    if (!mes || !ano) {
      return res.status(400).json({ error: "mes e ano sao obrigatorios" });
    }

    var pagamentos = await listarPagamentosParaResumo(parseInt(mes), parseInt(ano));
    if (pagamentos.length === 0) {
      return res.status(404).json({ error: "Nenhum pagamento encontrado para o periodo indicado" });
    }

    // Determinar organizacao a partir do primeiro colaborador
    var primeiroColab = pagamentos[0] && pagamentos[0].colaborador ? pagamentos[0].colaborador : null;
    var org = await getOrganizacao(primeiroColab);

    var doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=resumo_pagamentos_" + mes + "_" + ano + ".pdf");
    doc.pipe(res);

    var ml = 40;
    var pw = doc.page.width;
    var w = doc.page.width - 80;
    var y = 42;

    if (org && org.logo_url) {
      try {
        var logoPath = org.logo_url;
        if (logoPath.startsWith("/uploads/")) { logoPath = path.join(__dirname, "..", logoPath); }
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, pw / 2 - 35, y, { fit: [70, 70] });
          y += 78;
        }
      } catch (e) {}
    }

    if (org && org.nome) {
      doc.font("Helvetica-Bold").fontSize(16).fillColor("#000000");
      doc.text(normalizeForPdf(org.nome), ml, y, { align: "center", width: w });
      y += 24;
    }

    doc.font("Helvetica-Bold").fontSize(14).fillColor("#1a1a1a");
    doc.text("Resumo de Pagamentos", ml, y, { align: "center", width: w });
    y += 18;

    doc.font("Helvetica").fontSize(10).fillColor("#666666");
    doc.text("Mes de " + MESES[parseInt(mes) - 1] + " de " + ano, ml, y, { align: "center", width: w });
    y += 24;

    // Agregacao
    var totalColab = pagamentos.length;
    var totalBruto = 0, totalSubsidios = 0, totalExtras = 0, totalIRT = 0, totalSS = 0, totalFaltas = 0, totalLiquido = 0;
    var porEstado = { Pendente: 0, Pago: 0, Cancelado: 0 };

    pagamentos.forEach(function (p) {
      totalBruto += parseFloat(p.salario_base) || 0;
      totalSubsidios += parseFloat(p.subsidios) || 0;
      totalExtras += parseFloat(p.horas_extras) || 0;
      totalIRT += parseFloat(p.irt) || 0;
      totalSS += parseFloat(p.seguranca_social) || 0;
      totalFaltas += parseFloat(p.desconto_faltas) || 0;
      totalLiquido += parseFloat(p.total_liquido) || 0;
      if (porEstado[p.estado] !== undefined) porEstado[p.estado]++;
    });

    // Bloco resumo
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#333333");
    doc.text("SUMARIO DO PERIODO", ml, y);
    y += 16;

    function resumoRow(label, value) {
      doc.font("Helvetica").fontSize(10).fillColor("#000000");
      doc.text(label, ml + 8, y);
      doc.text(value, pw - 60 - 180, y, { align: "right", width: 180 });
      y += 18;
    }

    resumoRow("Total de Colaboradores", String(totalColab));
    resumoRow("Total Vencimentos (Bruto)", fmt(totalBruto) + " Kz");
    resumoRow("  Subsidios", fmt(totalSubsidios) + " Kz");
    resumoRow("  Horas Extras", fmt(totalExtras) + " Kz");
    resumoRow("Total IRT", "- " + fmt(totalIRT) + " Kz");
    resumoRow("Total Seguranca Social", "- " + fmt(totalSS) + " Kz");
    resumoRow("Total Desconto Faltas", "- " + fmt(totalFaltas) + " Kz");

    var ly = y;
    doc.rect(40, ly - 6, pw - 80, 26).fill("#eef2f7");
    doc.fillColor("#111111").font("Helvetica-Bold").fontSize(13);
    doc.text("TOTAL LIQUIDO A PAGAR", ml + 8, ly);
    doc.text(fmt(totalLiquido) + " Kz", pw - 60 - 180, ly, { align: "right", width: 180 });
    y = ly + 26;

    doc.font("Helvetica").fontSize(9).fillColor("#666666");
    doc.text("Estado: Pendente " + porEstado.Pendente + " | Pago " + porEstado.Pago + " | Cancelado " + porEstado.Cancelado, ml, y);
    y += 24;

    // Tabela de detalhes
    addLine(doc, y); y += 6;

    if (y > 560) { doc.addPage(); y = 50; }

    doc.font("Helvetica-Bold").fontSize(11).fillColor("#333333");
    doc.text("DETALHE POR COLABORADOR", ml, y);
    y += 18;

    var headers = ["N.", "Colaborador", "Salario Base", "Subsidios", "Extras", "IRT", "SS", "Faltas", "Liquido", "Estado"];
    var colWidths = [30, 170, 70, 65, 55, 60, 55, 55, 70, 60];
    var startX = 40;
    var tableW = pw - 80;

    function drawRow(cells, yPos, isHeader, isTotal) {
      var x = startX;
      doc.font(isHeader || isTotal ? "Helvetica-Bold" : "Helvetica").fontSize(isHeader ? 8.5 : 8).fillColor(isHeader ? "#ffffff" : isTotal ? "#111111" : "#333333");
      if (isHeader) {
        doc.rect(startX, yPos - 5, tableW, 18).fill("#2b3a4a");
        doc.fillColor("#ffffff");
      } else if (isTotal) {
        doc.rect(startX, yPos - 5, tableW, 18).fill("#eef2f7");
        doc.fillColor("#111111");
      }
      x = startX;
      for (var c = 0; c < cells.length; c++) {
        doc.text(String(cells[c]), x + 3, yPos, { width: colWidths[c] - 6, height: 14, ellipsis: true });
        x += colWidths[c];
      }
      return yPos + 14;
    }

    // Header
    var headerCells = headers.slice();
    drawRow(headerCells, y, true, false);
    y += 18;
    doc.fillColor("#333333").font("Helvetica");

    for (var r = 0; r < pagamentos.length; r++) {
      var p = pagamentos[r];
      if (y > 740) {
        doc.addPage();
        y = 50;
        drawRow(headers.slice(), y, true, false);
        y += 18;
      }
      var nome = (p.colaborador ? p.colaborador.nome_completo : "") || "";
      if (nome.length > 28) nome = nome.substring(0, 26) + "...";
      var rowCells = [
        (r + 1),
        nome,
        fmt(p.salario_base),
        fmt(p.subsidios),
        fmt(p.horas_extras),
        fmt(p.irt),
        fmt(p.seguranca_social),
        fmt(p.desconto_faltas),
        fmt(p.total_liquido),
        p.estado,
      ];
      y = drawRow(rowCells, y, false, false);
    }

    // Linha de total
    y += 2;
    drawRow([
      "",
      "TOTAL",
      fmt(totalBruto),
      fmt(totalSubsidios),
      fmt(totalExtras),
      fmt(totalIRT),
      fmt(totalSS),
      fmt(totalFaltas),
      fmt(totalLiquido),
      "",
    ], y, false, true);
    y += 24;

    drawFooter(doc, org);
    doc.end();
  } catch (e) {
    console.log("Erro ao gerar PDF resumo pagamentos:", e.message);
    return res.status(500).json({ error: "Erro ao gerar PDF" });
  }
};
