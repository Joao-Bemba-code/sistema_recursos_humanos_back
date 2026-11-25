var PDFDocument = require("pdfkit");
var { Op } = require("sequelize");
var {
  Colaborador,
  Organizacao,
  Cargo,
  Unidade,
  Contrato,
  EscalaSemanal,
  RegistoPresenca,
  BancoHoraMovimento,
  PicagemBiometrico,
} = require("../models");
var { registarAtividade } = require("../helpers/atividade");
var { temPermissao } = require("../protect/rbac");
var { ORG_INEXISTENTE } = require("../helpers/organizacao");

var MESES = ["Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
var NOME_FICHEIRO = "mapa_assiduidade";

// ==================== TEXTO / ACENTOS (mesma estrategia do pdfController) ====================

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
  result = result.replace(/[""]{2,}/g, '"');
  result = result.replace(/["']\s*[A-Z]{1,3}[Æœ]+[^a-zA-Z]*/g, "");
  result = result.replace(/[ÆŒ]{2,}[^a-zA-Z]*/g, "");
  result = result.replace(/[÷§«»]+/g, "");
  result = result.replace(/\t+/g, " ");
  result = result.replace(/ {3,}/g, "  ");
  result = result.replace(/[^\x00-\x7F]{3,}/g, "");
  return result;
}

function normalizeForPdf(str) {
  if (!str) return "";
  var result = decodeHtmlEntities(String(str));
  result = htmlToParagraphs(result);
  result = stripHtmlTags(result);
  result = stripGarbageChars(result);
  result = cleanGarbledFragments(result);
  return result;
}

// ==================== ERROS / VALIDACAO ====================

var erro = function (status, mensagem) {
  var e = new Error(mensagem);
  e.status = status;
  return e;
};

var responderErro = function (res, e, contexto) {
  var status = e.status || 500;
  if (status >= 500) {
    console.log("Erro " + (contexto || "mapa de assiduidade") + ":", e.message);
  }
  return res.status(status).json({ error: status >= 500 ? "Erro interno do servidor" : e.message });
};

var fmt = function (val) {
  var n = parseFloat(val) || 0;
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Datas/horas das picagens vêm como Date do MySQL. Usamos a hora local para
// nao deslocar um dia por causa do fuso horario.
function dataLocal(valor) {
  if (!valor) return "";
  var d = valor instanceof Date ? valor : new Date(valor);
  if (isNaN(d.getTime())) return String(valor).slice(0, 10);
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

function horaLocal(valor) {
  if (!valor) return "";
  var d = valor instanceof Date ? valor : new Date(valor);
  if (isNaN(d.getTime())) return String(valor).slice(0, 5);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

// Horario contratual lido da escala semanal do colaborador (ex.:
// "Seg,Ter,Qua,Qui,Sex 08:00-16:00"). Sem escala fica vazio.
function horarioDeEscalas(escalas) {
  if (!escalas || !escalas.length) return "";
  var dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  var grupos = {};
  (escalas || []).forEach(function (e) {
    if (!e.hora_entrada && !e.hora_saida) return;
    var chave = horaCurta(e.hora_entrada) + "-" + horaCurta(e.hora_saida);
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(Number(e.dia_semana));
  });
  return Object.keys(grupos).map(function (chave) {
    var ordenados = grupos[chave].sort(function (a, b) { return a - b; });
    return ordenados.map(function (d) { return dias[d] || String(d); }).join(",") + " " + chave;
  }).join(" | ");
}

// ==================== AUXILIARES DE ASSIDUIDADE ====================

function periodo(mes, ano) {
  var inicio = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  var fim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
  return { inicio: inicio, fim: fim, quantidade: new Date(Date.UTC(ano, mes, 0)).getUTCDate() };
}

function horaCurta(valor) {
  if (!valor) return "";
  return String(valor).slice(0, 5);
}

function minutosDeHora(valor) {
  if (!valor) return null;
  var partes = String(valor).slice(0, 5).split(":");
  if (partes.length < 2) return null;
  var h = parseInt(partes[0], 10);
  var m = parseInt(partes[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

function fmtHorasMinutos(valor) {
  var minutos = Math.round((parseFloat(valor) || 0) * 60);
  if (minutos === 0) return "0min";
  var sinal = minutos < 0 ? "-" : "";
  var absoluto = Math.abs(minutos);
  var h = Math.floor(absoluto / 60);
  var m = absoluto % 60;
  if (h === 0) return sinal + m + "min";
  if (m === 0) return sinal + h + "h";
  return sinal + h + "h" + (m < 10 ? "0" : "") + m + "min";
}

function ocorrenciaDe(registo) {
  if (!registo) return "";
  if (registo.estado === "Licenca") return "D";
  if (registo.estado === "Ferias" || registo.estado === "Fim_semana") return "F";
  if (registo.estado === "Ausente") return registo.justificado ? "FJ" : "FI";
  if (registo.estado === "Atrasado" && registo.justificado) return "D";
  return "";
}

var CAMPOS_DIARIOS = [
  "prevista", "entrada", "atraso", "saidaAlmoco", "regAlmoco", "saida",
  "ocorrencia", "idPortal", "justificativo", "rubrica", "bolsa", "desconto",
];

// Monta as colunas diarias a partir dos registos de presenca e das picagens do
// biometrico. Os campos sem coluna no modelo (saida/registo de almoco) ficam
// deliberadamente vazios.
function montarMapaDiario(opcoes) {
  var mapa = {};
  for (var c = 0; c < CAMPOS_DIARIOS.length; c++) {
    mapa[CAMPOS_DIARIOS[c]] = [];
    for (var d = 0; d <= opcoes.quantidade; d++) mapa[CAMPOS_DIARIOS[c]].push("");
  }

  var porDia = {};
  (opcoes.registos || []).forEach(function (r) {
    var dia = parseInt(String(r.data).slice(8, 10), 10);
    if (dia >= 1 && dia <= opcoes.quantidade) porDia[dia] = r;
  });

  // Picagens do biometrico: também preenchem os dias que ainda nao tem
  // registo de presenca e as saidas que o registo nao tem.
  var picagensPorDia = {};
  (opcoes.picagens || []).forEach(function (p) {
    var dataStr = dataLocal(p.data_hora);
    if (!dataStr || dataStr < opcoes.inicio || dataStr > opcoes.fim) return;
    var dia = parseInt(dataStr.slice(8, 10), 10);
    if (!picagensPorDia[dia]) picagensPorDia[dia] = [];
    picagensPorDia[dia].push(p);
  });
  Object.keys(picagensPorDia).forEach(function (dia) {
    picagensPorDia[dia].sort(function (a, b) {
      return new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime();
    });
  });

  var previstaPorSemana = {};
  (opcoes.escalas || []).forEach(function (e) {
    previstaPorSemana[Number(e.dia_semana)] = e.hora_entrada || null;
  });

  var movPorRegisto = {};
  (opcoes.movimentos || []).forEach(function (m) {
    if (!m.registo_presenca_id) return;
    var chave = String(m.registo_presenca_id);
    if (!movPorRegisto[chave]) movPorRegisto[chave] = [];
    movPorRegisto[chave].push(m);
  });

  var totalAtraso = 0;
  var faltas = 0;
  var prefixo = opcoes.inicio.slice(0, 8);

  for (var dia = 1; dia <= opcoes.quantidade; dia++) {
    var r = porDia[dia] || null;
    var pics = picagensPorDia[dia] || [];
    var entradaPic = pics.length ? horaLocal(pics[0].data_hora) : "";
    var saidaPic = pics.length > 1 ? horaLocal(pics[pics.length - 1].data_hora) : "";
    var dataStr = prefixo + (dia < 10 ? "0" : "") + dia;
    var diaSemana = new Date(dataStr + "T00:00:00").getDay();
    var prevista = previstaPorSemana[diaSemana] || null;

    mapa.prevista[dia] = prevista ? horaCurta(prevista) : "";
    mapa.entrada[dia] = (r && r.hora_entrada ? horaCurta(r.hora_entrada) : "") || entradaPic;
    mapa.saida[dia] = (r && r.hora_saida ? horaCurta(r.hora_saida) : "") || saidaPic;

    if (prevista && mapa.entrada[dia]) {
      var real = minutosDeHora(mapa.entrada[dia]);
      var esperada = minutosDeHora(prevista);
      if (real !== null && esperada !== null && real - esperada > 15) {
        mapa.atraso[dia] = String(real - esperada);
        totalAtraso += real - esperada;
      }
    }

    mapa.ocorrencia[dia] = ocorrenciaDe(r);
    if (mapa.ocorrencia[dia] === "FI" || mapa.ocorrencia[dia] === "FJ") faltas++;

    var temDado = !!(r || pics.length);
    mapa.idPortal[dia] = temDado ? String(opcoes.numeroColaborador || "") : "";
    mapa.justificativo[dia] = r && (r.justificado || r.documento_justificacao) ? "Sim" : "";
    mapa.rubrica[dia] = temDado ? "____" : "";

    var movimentosDia = r ? (movPorRegisto[String(r.id)] || []) : [];
    if (movimentosDia.length > 0) {
      var bolsa = 0;
      var desconto = 0;
      movimentosDia.forEach(function (m) {
        bolsa += (parseFloat(m.horas) || 0) - (parseFloat(m.horas_compensadas) || 0);
        desconto += parseFloat(m.valor_descontado) || 0;
      });
      mapa.bolsa[dia] = fmtHorasMinutos(bolsa);
      mapa.desconto[dia] = desconto ? fmt(desconto) : "";
    }
  }

  return { mapa: mapa, totalAtraso: totalAtraso, faltas: faltas };
}

// ==================== DESENHO DO PDF ====================

function linhaHorizontal(doc, x1, x2, y, cor) {
  doc.moveTo(x1, y).lineTo(x2, y).strokeColor(cor || "#e0e0e0").lineWidth(0.5).stroke();
  doc.strokeColor("#000000");
}

function desenharMapa(doc, opcoes) {
  var ml = 35;
  var mr = 35;
  var pw = doc.page.width;
  var largura = pw - ml - mr;
  var y = 32;
  var nomeOrg = opcoes.organizacao && opcoes.organizacao.nome ? normalizeForPdf(opcoes.organizacao.nome) : "GRUPO KAMATAMBU";

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#000000");
  doc.text(nomeOrg, ml, y, { width: largura, align: "center" });
  y = doc.y + 2;

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#1a1a1a");
  doc.text("ANEXO III - MAPA MENSAL DE CONTROLO DE ASSIDUIDADE E BOLSA DE HORAS", ml, y, { width: largura, align: "center" });
  y = doc.y + 12;

  doc.font("Helvetica").fontSize(7).fillColor("#555555");
  doc.text("Codigo: GK-RH-MAPM(3) | Ref. cap. 11 e III | Vigencia: 25/11/2026 | Tolerancia Mensal: 15 Minutos", ml, y, { width: largura, align: "center" });
  y = doc.y + 10;

  linhaHorizontal(doc, ml, pw - mr, y, "#999999");
  y += 8;

  var larguraCol = largura / 2;
  function campo(label, valor, x, yPos) {
    doc.font("Helvetica-Bold").fontSize(7).fillColor("#333333");
    doc.text(label + ":", x, yPos, { width: 100, height: 10, ellipsis: true });
    doc.font("Helvetica").fillColor("#000000");
    doc.text(normalizeForPdf(valor === null || valor === undefined || valor === "" ? "—" : String(valor)), x + 100, yPos, { width: larguraCol - 105, height: 10, ellipsis: true });
  }

  var esq = ml;
  var dir = ml + larguraCol + 8;
  campo("Unidade de Negocio", opcoes.unidadeNegocio, esq, y);
  campo("Colaborador", opcoes.nomeColaborador, dir, y); y += 11;
  campo("Cargo/Funcao", opcoes.cargoFuncao, esq, y);
  campo("Numero", opcoes.numeroColaborador, dir, y); y += 11;
  campo("Mes/Ano", MESES[opcoes.mes - 1] + " / " + opcoes.ano, esq, y);
  campo("Horario Contratual", opcoes.horarioContratual, dir, y); y += 11;
  campo("Saldo Anterior", fmtHorasMinutos(opcoes.saldoAnterior), esq, y);
  campo("Portal RH", "Obrigatorio", dir, y); y += 15;

  var rotuloW = 105;
  var totalW = 45;
  var diasW = (largura - rotuloW - totalW) / opcoes.quantidade;
  var dias = [];
  for (var i = 1; i <= opcoes.quantidade; i++) dias.push(i < 10 ? "0" + i : String(i));
  var cabecalho = ["DIA"].concat(dias).concat(["Total"]);

  function linhaTabela(cells, yPos, isHeader) {
    var x = ml;
    var altura = isHeader ? 12 : 10;
    doc.font(isHeader ? "Helvetica-Bold" : "Helvetica").fontSize(isHeader ? 5.8 : 5.5);
    doc.fillColor(isHeader ? "#ffffff" : "#222222");
    if (isHeader) {
      doc.rect(ml, yPos - 2, largura, altura).fill("#2b3a4a");
      doc.fillColor("#ffffff");
    }
    for (var c = 0; c < cells.length; c++) {
      var larguraCelula = c === 0 ? rotuloW : (c === cells.length - 1 ? totalW : diasW);
      var valor = cells[c];
      if (valor !== null && valor !== undefined && valor !== "") {
        doc.text(String(valor), x + 1, yPos, {
          width: larguraCelula - 2,
          height: altura - 1,
          align: c === 0 ? "left" : "center",
          ellipsis: true,
        });
      }
      x += larguraCelula;
    }
    if (!isHeader) linhaHorizontal(doc, ml, pw - mr, yPos + altura - 1, "#eeeeee");
    doc.fillColor("#000000");
    return yPos + altura;
  }

  function novoBlocoTabela() {
    doc.addPage();
    y = 35;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#333333");
    doc.text(nomeOrg + " | " + MESES[opcoes.mes - 1] + " / " + opcoes.ano + " | " + normalizeForPdf(opcoes.nomeColaborador), ml, y, { width: largura, align: "center" });
    y = doc.y + 6;
    return linhaTabela(cabecalho, y, true);
  }

  y = linhaTabela(cabecalho, y, true);

  var linhas = [
    ["Entrada Prevista", "prevista", ""],
    ["Entrada Real", "entrada", ""],
    ["Atraso (Min)", "atraso", opcoes.totalAtraso ? String(opcoes.totalAtraso) : ""],
    ["Saida Almoco", "saidaAlmoco", ""],
    ["Reg. Almoco", "regAlmoco", ""],
    ["Saida Final", "saida", ""],
    ["Ocorrencia (D/FJ/FI/F)", "ocorrencia", ""],
    ["ID portal", "idPortal", ""],
    ["Justificativo (48h)", "justificativo", ""],
    ["Rubrica coordenador", "rubrica", ""],
    ["Bolsa (+/-) h/min", "bolsa", fmtHorasMinutos(opcoes.bolsaCredito)],
    ["Desconto (Kz)", "desconto", opcoes.totalDesconto ? fmt(opcoes.totalDesconto) : ""],
  ];

  for (var l = 0; l < linhas.length; l++) {
    if (y + 10 > doc.page.height - 60) y = novoBlocoTabela();
    var cells = [linhas[l][0]].concat(opcoes.mapa[linhas[l][1]].slice(1)).concat([linhas[l][2]]);
    y = linhaTabela(cells, y, false);
  }

  y += 8;
  if (y + 60 > doc.page.height - 40) {
    doc.addPage();
    y = 40;
  }

  var metade = largura / 2;
  function totalBloco(label, valor, x, yPos) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#333333");
    doc.text(label + ":", x, yPos, { width: metade - 10, height: 10, ellipsis: true });
    doc.font("Helvetica").fillColor("#000000");
    doc.text(normalizeForPdf(String(valor)), x + 150, yPos, { width: metade - 160, height: 10, ellipsis: true });
  }

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#222222");
  doc.text("TOTAIS", ml, y);
  y += 13;
  totalBloco("Total(min)", opcoes.totalAtraso, ml, y);
  totalBloco("Faltas", opcoes.faltas, ml + metade + 8, y); y += 11;
  totalBloco("Bolsa de Horas Cred.", fmtHorasMinutos(opcoes.bolsaCredito), ml, y);
  totalBloco("Saldo Final", fmtHorasMinutos(opcoes.saldoFinal), ml + metade + 8, y); y += 16;

  // Rubrica do coordenador: nome do responsavel da unidade, quando existe,
  // com espaco para assinatura e data. Fica antes da legenda para nunca ser
  // empurrado para fora da pagina.
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#222222");
  doc.text("Rubrica do Coordenador: " + (normalizeForPdf(opcoes.coordenador) || "Responsavel da unidade"), ml, y, { width: largura });
  y += 13;
  linhaHorizontal(doc, ml, ml + 260, y, "#777777");
  doc.font("Helvetica").fontSize(7).fillColor("#666666");
  doc.text("Assinatura / Data", ml, y + 3, { width: 260, align: "center" });
  y += 20;

  doc.font("Helvetica-Bold").fontSize(8).fillColor("#222222");
  doc.text("LEGENDA", ml, y);
  y += 11;
  doc.font("Helvetica").fontSize(7).fillColor("#444444");
  var legendas = [
    "D = Dispensa Autorizada 24h",
    "FJ = Falta Justificada (aviso ate a 1a hora + comprovativo no Portal Fisico 48h uteis)",
    "FI = Falta Injustificada",
    "F = Folga/Feriado",
    "Tolerancia maxima acumulada: 15 minutos.",
  ];
  for (var g = 0; g < legendas.length; g++) {
    doc.text(normalizeForPdf(legendas[g]), ml, y, { width: largura });
    y = doc.y + 2;
  }
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#8a1c1c");
  doc.text("Portal RH - Obrigatorio", ml, y, { width: largura });

  doc.font("Helvetica").fontSize(7).fillColor("#888888");
  doc.text(nomeOrg + " | Documento gerado pelo sistema SGHR", ml, doc.page.height - 22, { width: largura, align: "center" });
}

function criarPdf(opcoes) {
  return new Promise(function (resolve, reject) {
    var doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 35 });
    var partes = [];
    doc.on("data", function (parte) { partes.push(parte); });
    doc.on("end", function () { resolve(Buffer.concat(partes)); });
    doc.on("error", reject);
    try {
      desenharMapa(doc, opcoes);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ==================== HANDLER ====================

// Gera o PDF e entrega-o directamente para descarga em Relatorios. O mapa NAO
// fica anexado a ficha do colaborador: e apenas um documento descarregado.
exports.gerar = async function (req, res) {
  try {
    var corpo = req.body || {};
    var query = req.query || {};
    var colaboradorId = corpo.colaborador_id || query.colaborador_id;
    var mes = parseInt(corpo.mes || query.mes, 10);
    var ano = parseInt(corpo.ano || query.ano, 10);

    if (!colaboradorId) throw erro(400, "colaborador_id e obrigatorio");
    if (!mes || mes < 1 || mes > 12) throw erro(400, "Mes invalido (deve estar entre 1 e 12)");
    if (!ano || ano < 1900 || ano > 2100) throw erro(400, "Ano invalido");

    if (!temPermissao(req.utilizador, "documentos_colaborador", "download")) {
      throw erro(403, "O seu perfil não permite descarregar documentos");
    }

    var colaborador = await Colaborador.findOne({
      where: { id: colaboradorId, organizacao_id: req.organizacao_id || ORG_INEXISTENTE },
      include: [
        { model: Organizacao, as: "organizacao" },
        { model: Cargo, as: "cargo" },
        { model: Unidade, as: "unidade" },
      ],
    });
    if (!colaborador) throw erro(404, "Colaborador não encontrado");

    var periodoMapa = periodo(mes, ano);

    var registos = await RegistoPresenca.findAll({
      where: { colaborador_id: colaborador.id, data: { [Op.between]: [periodoMapa.inicio, periodoMapa.fim] } },
      order: [["data", "ASC"]],
    });

    // Picagens do biometrico, pelo colaborador ou pelo ID do aparelho, para
    // incluir todos os dias e todas as saidas que o aparelho registou.
    var condicoes = [{ colaborador_id: colaborador.id }];
    if (colaborador.id_biometrico) condicoes.push({ id_biometrico: String(colaborador.id_biometrico) });
    var wherePicagens = {
      data_hora: {
        [Op.between]: [
          new Date(ano, mes - 1, 1, 0, 0, 0, 0),
          new Date(ano, mes, 0, 23, 59, 59, 999),
        ],
      },
    };
    if (condicoes.length === 1) wherePicagens.colaborador_id = colaborador.id;
    else wherePicagens[Op.or] = condicoes;

    var picagens = await PicagemBiometrico.findAll({
      where: wherePicagens,
      order: [["data_hora", "ASC"]],
    });

    var movimentos = await BancoHoraMovimento.findAll({
      where: { colaborador_id: colaborador.id, data: { [Op.lte]: periodoMapa.fim } },
      order: [["data", "ASC"]],
    });

    var contrato = await Contrato.findOne({
      where: { colaborador_id: colaborador.id, estado: "Activo" },
      order: [["data_inicio", "DESC"]],
    });
    var escalas = await EscalaSemanal.findAll({ where: { colaborador_id: colaborador.id } });

    var saldoAnterior = 0;
    var saldoCorrente = 0;
    var bolsaCredito = 0;
    var totalDesconto = 0;
    movimentos.forEach(function (m) {
      if (m.estado === "justificado") return;
      var valor = (parseFloat(m.horas) || 0) - (parseFloat(m.horas_compensadas) || 0);
      if (String(m.data) < periodoMapa.inicio) {
        saldoAnterior += valor;
      } else {
        saldoCorrente += valor;
        if (valor > 0) bolsaCredito += valor;
      }
      totalDesconto += parseFloat(m.valor_descontado) || 0;
    });
    var saldoFinal = saldoAnterior + saldoCorrente;

    var diario = montarMapaDiario({
      registos: registos,
      picagens: picagens,
      movimentos: movimentos,
      escalas: escalas,
      quantidade: periodoMapa.quantidade,
      inicio: periodoMapa.inicio,
      fim: periodoMapa.fim,
      numeroColaborador: colaborador.numero_colaborador,
    });

    var nomeColaborador = colaborador.nome_completo || colaborador.numero_colaborador || "Colaborador";
    var nomeFicheiro = NOME_FICHEIRO + "_" + mes + "_" + ano + ".pdf";

    var buffer = await criarPdf({
      organizacao: colaborador.organizacao || null,
      nomeColaborador: nomeColaborador,
      numeroColaborador: colaborador.numero_colaborador || "—",
      unidadeNegocio: colaborador.unidade_negocio || (colaborador.unidade && colaborador.unidade.nome) || "—",
      cargoFuncao: (colaborador.cargo && colaborador.cargo.nome) || (contrato && contrato.funcao) || "—",
      mes: mes,
      ano: ano,
      horarioContratual: horarioDeEscalas(escalas) || (contrato && contrato.horario_trabalho) || "—",
      coordenador: (colaborador.unidade && colaborador.unidade.responsavel_nome) || "",
      saldoAnterior: saldoAnterior,
      saldoFinal: saldoFinal,
      bolsaCredito: bolsaCredito,
      totalDesconto: totalDesconto,
      totalAtraso: diario.totalAtraso,
      faltas: diario.faltas,
      mapa: diario.mapa,
      quantidade: periodoMapa.quantidade,
    });

    var descricaoPublica = "Mapa mensal de assiduidade " + mes + "/" + ano + " descarregado para " + nomeColaborador;
    await registarAtividade({
      req: req,
      accao: "mapa_assiduidade_descarregado",
      modulo: "documentos_colaborador",
      entidade: "MapaAssiduidade",
      entidadeId: colaborador.id,
      colaboradorId: colaborador.id,
      descricao: descricaoPublica,
      descricaoPublica: descricaoPublica,
      dadosDepois: { mes: mes, ano: ano },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(nomeFicheiro));
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(buffer);
  } catch (e) {
    return responderErro(res, e, "gerar mapa de assiduidade");
  }
};
