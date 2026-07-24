var PDFDocument = require("pdfkit");
var path = require("path");
var fs = require("fs");
var { Vencimento, Pagamento, Colaborador, Contrato, Organizacao } = require("../models");

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

function drawHeader(doc, titulo, subtitulo, org) {
  var orgNome = org ? org.nome : "SGHR";
  var orgSub = org ? (org.nome_curto || org.nome) : "Sistema de Gestao de Recursos Humanos";
  doc.rect(0, 0, doc.page.width, 90).fill("#002b92");
  doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold").text(orgNome, 40, 22, { continued: true });
  doc.fontSize(10).font("Helvetica").text("  " + orgSub, 0, 26, { align: "left" });
  doc.fontSize(16).font("Helvetica-Bold").text(titulo, 40, 52);
  doc.fontSize(9).font("Helvetica").text(subtitulo, 40, 70);
  doc.fillColor("#000000");
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

function replacePlaceholders(template, vars) {
  var result = template;
  var keys = Object.keys(vars);
  for (var i = 0; i < keys.length; i++) {
    var regex = new RegExp("\\{" + keys[i] + "\\}", "g");
    result = result.replace(regex, vars[keys[i]] || "");
  }
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

    var vencimento = await Vencimento.findOne({
      where: { colaborador_id: pagamento.colaborador_id, estado: "Activo" },
      order: [["data_inicio", "DESC"]],
    });

    var colab = pagamento.colaborador;
    var org = await getOrganizacao(colab);

    var doc = new PDFDocument({ size: "A4", margin: 40 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=recibo_vencimento_" + (colab ? colab.numero_colaborador : "") + ".pdf");
    doc.pipe(res);

    drawHeader(doc, "Recibo de Vencimento", "Mes de " + MESES[pagamento.mes - 1] + " de " + pagamento.ano, org);

    var y = 110;

    if (colab) {
      doc.fontSize(11).font("Helvetica-Bold").text("Dados do Colaborador", 40, y);
      y += 18;
      doc.fontSize(9).font("Helvetica");
      doc.text("Nome: " + colab.nome_completo, 40, y); y += 14;
      doc.text("N. Colaborador: " + colab.numero_colaborador, 40, y); y += 14;
      if (colab.nif) { doc.text("NIF: " + colab.nif, 40, y); y += 14; }
      if (colab.numero_seguranca_social) { doc.text("N. Seguranca Social: " + colab.numero_seguranca_social, 40, y); y += 14; }
      if (colab.conta_bancaria) { doc.text("Conta Bancaria: " + colab.conta_bancaria, 40, y); y += 14; }
      y += 6;
    }

    addLine(doc, y); y += 12;

    doc.fontSize(11).font("Helvetica-Bold").text("Detalhes do Vencimento", 40, y);
    y += 20;

    var col1 = 50;
    var col2 = 200;
    var rowH = 16;

    doc.fontSize(9).font("Helvetica-Bold").fillColor("#002b92");
    doc.text("Descricao", col1, y);
    doc.text("Valores", col2, y);
    y += 16;
    addLine(doc, y); y += 4;
    doc.fillColor("#000000").font("Helvetica");

    doc.font("Helvetica-Bold").fillColor("#15803d").text("VENCIMENTOS", col1, y); y += rowH;
    doc.font("Helvetica").fillColor("#000000");

    var rows = [
      ["Salario Base", pagamento.salario_base],
      ["Subsidio de Alimentacao", vencimento ? vencimento.subsidio_alimentacao : 0],
      ["Subsidio de Transporte", vencimento ? vencimento.subsidio_transporte : 0],
      ["Subsidio de Educacao", vencimento ? vencimento.subsidio_educacao : 0],
      ["Outros Subsidios", vencimento ? vencimento.outros_subsidios : 0],
      ["Horas Extras", pagamento.horas_extras],
    ];

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var val = parseFloat(r[1]) || 0;
      if (val > 0) {
        doc.text("  " + r[0], col1, y);
        doc.text(fmt(r[1]) + " Kz", col2, y);
        y += rowH;
      }
    }
    y += 4;

    doc.font("Helvetica-Bold").fillColor("#002b92");
    doc.text("Total Vencimentos", col1, y);
    doc.text(fmt(pagamento.salario_base) + " Kz", col2, y);
    y += rowH + 4;
    addLine(doc, y); y += 8;

    doc.font("Helvetica-Bold").fillColor("#ba1a1a").text("DESCONTOS", col1, y); y += rowH;
    doc.font("Helvetica").fillColor("#000000");

    var descontos = [
      ["IRT", pagamento.irt],
      ["Seguranca Social", pagamento.seguranca_social],
      ["Outros Descontos", pagamento.descontos],
    ];

    for (var j = 0; j < descontos.length; j++) {
      var d = descontos[j];
      var dval = parseFloat(d[1]) || 0;
      if (dval > 0) {
        doc.text("  " + d[0], col1, y);
        doc.text("- " + fmt(d[1]) + " Kz", col2, y);
        y += rowH;
      }
    }
    y += 4;

    var totalDescontos = (parseFloat(pagamento.irt) || 0) + (parseFloat(pagamento.seguranca_social) || 0) + (parseFloat(pagamento.descontos) || 0);
    doc.font("Helvetica-Bold").fillColor("#ba1a1a");
    doc.text("Total Descontos", col1, y);
    doc.text("- " + fmt(totalDescontos) + " Kz", col2, y);
    y += rowH + 4;
    addLine(doc, y); y += 10;

    doc.fontSize(12).font("Helvetica-Bold").fillColor("#002b92");
    doc.text("TOTAL LIQUIDO A RECEBER", col1, y);
    doc.text(fmt(pagamento.total_liquido) + " Kz", col2, y);
    y += 24;

    addLine(doc, y); y += 14;

    doc.fontSize(9).font("Helvetica").fillColor("#666666");
    doc.text("Estado: " + pagamento.estado, 40, y); y += 14;
    if (pagamento.data_pagamento) {
      doc.text("Data de Pagamento: " + fmtDate(pagamento.data_pagamento), 40, y); y += 14;
    }
    doc.text("Periodo: " + MESES[pagamento.mes - 1] + " / " + pagamento.ano, 40, y); y += 20;

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

    // Header with logo
    var headerH = 100;
    doc.rect(0, 0, doc.page.width, headerH).fill("#002b92");

    var logoX = 50;
    var textX = 50;
    var hasLogo = drawLogo(doc, org, 50, 15, 70, 70);
    if (hasLogo) {
      textX = 135;
    }

    doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold");
    doc.text(org ? org.nome : "SGHR", textX, 18, { width: doc.page.width - textX - 50 });
    if (org && org.nome_curto) {
      doc.fontSize(10).font("Helvetica").text(org.nome_curto, textX, 38, { width: doc.page.width - textX - 50 });
    }
    doc.fontSize(12).font("Helvetica-Bold").text("CONTRATO DE TRABALHO", textX, 58);
    doc.fontSize(9).font("Helvetica").text("Ref: " + contrato.numero + " | " + contrato.tipo.replace("_", " "), textX, 76);
    doc.fillColor("#000000");

    var y = 120;
    var ml = 50;
    var w = doc.page.width - 100;
    var pw = doc.page.width;

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
        "PERIODO_EXPERIMENTACAO": contrato.periodo_experimentacao ? contrato.periodo_experimentacao + " dias" : "",
        "NOME_ORGANIZACAO": org ? org.nome : "",
        "NIF_ORGANIZACAO": org ? (org.nif || "") : "",
        "MORADA_ORGANIZACAO": org ? (org.endereco || "") : "",
        "CIDADE_ORGANIZACAO": org ? (org.cidade || "") : "",
        "PROVINCIA_ORGANIZACAO": org ? (org.provincia || "") : "",
        "PAIS_ORGANIZACAO": org ? (org.pais || "Angola") : "",
      };

      var templateTexto = replacePlaceholders(org.template_contrato, placeholders);

      // Draw template text line by line
      var linhas = templateTexto.split("\n");
      doc.font("Helvetica").fontSize(9).fillColor("#333333");

      for (var t = 0; t < linhas.length; t++) {
        if (y > 720) {
          doc.addPage();
          y = 50;
        }
        var linha = linhas[t];
        if (linha.trim() === "") {
          y += 8;
          continue;
        }

        // Check if line is a section title (starts with CLAUSULA or similar uppercase)
        var isTitle = linha.match(/^(CLAUSULA|CLÁUSULA|ARTIGO|SECCAO|SECÇÃO|TITULO|CAPITULO|CAPÍTULO)/i);
        if (isTitle) {
          y += 4;
          doc.font("Helvetica-Bold").fontSize(10).fillColor("#002b92");
          doc.text(linha.trim(), ml, y, { width: w });
          y = doc.y + 6;
          doc.font("Helvetica").fontSize(9).fillColor("#333333");
        } else {
          doc.text(linha, ml, y, { width: w, align: "justify", lineGap: 2 });
          y = doc.y + 3;
        }
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
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#002b92");
      doc.text("ENTIDADE EMPREGADORA", ml, y);
      y += 18;
      doc.font("Helvetica").fontSize(9).fillColor("#333333");
      doc.text("Denominacao: " + (org ? org.nome : "—"), ml, y); y += 14;
      doc.text("NIF: " + (org ? (org.nif || "—") : "—"), ml, y); y += 14;
      doc.text("Sede: " + (org ? ((org.endereco || "") + ", " + (org.cidade || "") + ", " + (org.pais || "Angola")) : "—"), ml, y); y += 20;

      // Dados do Trabalhador
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#002b92");
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
        doc.font("Helvetica-Bold").fontSize(10).fillColor("#002b92");
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
        "A Entidade Empregadora compromete-se a pagar ao trabalhador a retribuicao mensal de " + fmt(contrato.salario_base) + " " + contrato.moeda + ", sujeita aos descontos legais e paga 12 meses por ano, acrescida de duodecimos de subsidio de natal e de ferias calculados nos termos da lei.");

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

    drawHeader(doc, "Ficha do Colaborador", colab.numero_colaborador + " | " + colab.nome_completo, org);

    var y = 115;
    var ml = 50;
    var w = doc.page.width - 100;

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#002b92");
    doc.text("Dados Pessoais", ml, y); y += 20;
    doc.font("Helvetica").fontSize(9).fillColor("#333333");

    var dados = [
      ["Nome Completo", colab.nome_completo],
      ["N. Colaborador", colab.numero_colaborador],
      ["Data de Nascimento", colab.data_nascimento],
      ["Genero", colab.genero === "M" ? "Masculino" : colab.genero === "F" ? "Feminino" : colab.genero],
      ["Estado Civil", colab.estado_civil],
      ["NIF", colab.nif],
      ["BI", colab.bi],
      ["Email Institucional", colab.email_institucional],
      ["Email Pessoal", colab.email_pessoal],
      ["Telefone", colab.telefone],
      ["Endereco", colab.endereco],
      ["Cidade", colab.cidade],
      ["Provincia", colab.provincia],
    ];

    for (var i = 0; i < dados.length; i++) {
      if (dados[i][1]) {
        doc.font("Helvetica-Bold").text(dados[i][0] + ": ", ml, y, { continued: true, width: 200 });
        doc.font("Helvetica").text(" " + dados[i][1], ml + 130, y - 12, { width: w - 140 });
        y = doc.y + 4;
      }
    }

    y += 6;
    addLine(doc, y); y += 12;

    doc.font("Helvetica-Bold").fontSize(12).fillColor("#002b92");
    doc.text("Dados Profissionais", ml, y); y += 20;
    doc.font("Helvetica").fontSize(9).fillColor("#333333");

    var prof = [
      ["Tipo de Colaborador", colab.tipo_colaborador],
      ["Estado", colab.estado],
      ["Data de Admissao", colab.data_admissao],
      ["N. Seguranca Social", colab.numero_seguranca_social],
      ["Habilitacoes", colab.habilitacoes],
      ["Formacao Academica", colab.formacao_academica],
    ];

    for (var j = 0; j < prof.length; j++) {
      if (prof[j][1]) {
        doc.font("Helvetica-Bold").text(prof[j][0] + ": ", ml, y, { continued: true, width: 200 });
        doc.font("Helvetica").text(" " + prof[j][1], ml + 130, y - 12, { width: w - 140 });
        y = doc.y + 4;
      }
    }

    if (contrato) {
      y += 8;
      addLine(doc, y); y += 12;
      doc.font("Helvetica-Bold").fontSize(12).fillColor("#002b92");
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
          doc.font("Helvetica-Bold").text(ctr[k][0] + ": ", ml, y, { continued: true, width: 200 });
          doc.font("Helvetica").text(" " + ctr[k][1], ml + 130, y - 12, { width: w - 140 });
          y = doc.y + 4;
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
