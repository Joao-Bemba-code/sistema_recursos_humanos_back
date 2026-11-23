var test = require("node:test");
var assert = require("node:assert/strict");
var {
  calcularProgresso,
  validarDadosCurso,
  validarDadosInscricao,
  calcularResultadoAvaliacao,
  aplicarRegrasConclusao,
  extensaoCertificadoValida,
  nomeCertificado,
} = require("../helpers/formacao");

test("progresso estimado a partir da janela do curso", function () {
  var curso = { data_inicio: "2026-01-01", data_fim: "2026-01-11" };
  var meio = calcularProgresso({ estado: "Inscrito" }, curso, new Date("2026-01-06T00:00:00Z"));
  assert.equal(meio.progresso, 50);
  assert.equal(meio.em_atraso, false);

  var antes = calcularProgresso({ estado: "Inscrito" }, curso, new Date("2025-12-31T00:00:00Z"));
  assert.equal(antes.progresso, 0);

  var atrasado = calcularProgresso({ estado: "Inscrito" }, curso, new Date("2026-02-01T00:00:00Z"));
  assert.equal(atrasado.progresso, 99);
  assert.equal(atrasado.em_atraso, true);
});

test("conclusão manual prevalece sobre a data prevista", function () {
  var curso = { data_inicio: "2026-01-01", data_fim: "2026-01-11" };
  var inscricao = { estado: "Inscrito", concluida_manualmente: true, data_conclusao: "2026-03-01" };
  var resultado = calcularProgresso(inscricao, curso, new Date("2026-03-01T00:00:00Z"));
  assert.equal(resultado.progresso, 100);
  assert.equal(resultado.concluida, true);
  assert.equal(resultado.em_atraso, false);
});

test("validação de curso rejeita datas invertidas e vagas inválidas", function () {
  assert.match(validarDadosCurso({ nome: "", data_inicio: "2026-02-01", data_fim: "2026-01-01" }), /nome/i);
  assert.match(validarDadosCurso({ nome: "Curso", data_inicio: "2026-02-01", data_fim: "2026-01-01" }), /data de fim/i);
  assert.match(validarDadosCurso({ nome: "Curso", vagas: 2.5 }), /vagas/i);
  assert.equal(validarDadosCurso({ nome: "Curso", horas: 7.5, vagas: 10 }), null);
});

test("validação de inscrição aceita notas 0-20 e horas fracionárias", function () {
  assert.match(validarDadosInscricao({ nota_avaliacao: 21 }), /nota/i);
  assert.match(validarDadosInscricao({ estado: "Desconhecido" }), /estado/i);
  assert.equal(validarDadosInscricao({ nota_avaliacao: 15.5, horas_realizadas: 3.5, estado: "Concluido" }), null);
});

test("conclusão rápida mantém o estado Certificado e preenche as datas", function () {
  var resultado = aplicarRegrasConclusao(
    { estado: "Certificado", nota_avaliacao: 16, resultado: "Aprovado", concluida_manualmente: true },
    null,
    "2026-11-21"
  );
  assert.equal(resultado.estado, "Certificado");
  assert.equal(resultado.certificado, true);
  assert.equal(resultado.concluida_manualmente, true);
  assert.equal(resultado.data_conclusao, "2026-11-21");
  assert.equal(resultado.data_certificado, "2026-11-21");
});

test("conclusão manual não rebaixa certificado existente", function () {
  var existente = { estado: "Certificado", certificado: true, data_conclusao: "2026-10-01" };
  var resultado = aplicarRegrasConclusao({ concluida_manualmente: true }, existente, "2026-11-21");
  var final = Object.assign({}, existente, resultado);
  assert.equal(final.estado, "Certificado");
  assert.equal(final.certificado, true);
  assert.equal(final.data_conclusao, "2026-10-01");
});

test("conclusão manual de inscrição simples passa a Concluído", function () {
  var resultado = aplicarRegrasConclusao(
    { concluida_manualmente: true },
    { estado: "Inscrito" },
    "2026-11-21"
  );
  assert.equal(resultado.estado, "Concluido");
  assert.equal(resultado.data_conclusao, "2026-11-21");
  assert.equal(resultado.certificado, undefined);
});

test("conclusão usa a data de fim e as horas do curso", function () {
  var curso = { data_inicio: "2026-01-01", data_fim: "2026-03-15", horas: 40 };
  var resultado = aplicarRegrasConclusao(
    { estado: "Certificado", concluida_manualmente: true },
    null,
    "2026-11-21",
    curso
  );
  assert.equal(resultado.data_conclusao, "2026-03-15");
  assert.equal(resultado.horas_realizadas, 40);
  // Sem data de fim no curso, mantém-se a data atual como fallback.
  var semFim = aplicarRegrasConclusao({ estado: "Concluido" }, null, "2026-11-21", { horas: 20 });
  assert.equal(semFim.data_conclusao, "2026-11-21");
  assert.equal(semFim.horas_realizadas, 20);
});

test("resultado automático usa a nota mínima do curso (por omissão 10)", function () {
  assert.equal(calcularResultadoAvaliacao(9.5), "Reprovado");
  assert.equal(calcularResultadoAvaliacao(10), "Aprovado");
  assert.equal(calcularResultadoAvaliacao(15.5, 12), "Aprovado");
  assert.equal(calcularResultadoAvaliacao(11, 12), "Reprovado");
  assert.equal(calcularResultadoAvaliacao(""), null);
});

test("curso valida a nota mínima de aprovação", function () {
  assert.match(validarDadosCurso({ nome: "Curso", nota_minima_aprovacao: 21 }), /nota m[ií]nima/i);
  assert.equal(validarDadosCurso({ nome: "Curso", nota_minima_aprovacao: 12 }), null);
});

test("certificado aceita apenas PDF, PNG e JPG", function () {
  assert.equal(extensaoCertificadoValida("certificado.pdf", "application/pdf"), true);
  assert.equal(extensaoCertificadoValida("certificado.PNG", "image/png"), true);
  assert.equal(extensaoCertificadoValida("certificado.jpeg", "image/jpeg"), true);
  assert.equal(extensaoCertificadoValida("certificado.docx", "application/msword"), false);
  assert.equal(extensaoCertificadoValida("certificado.pdf", "application/zip"), false);
});

test("nome do certificado é seguro e identificável", function () {
  var nome = nomeCertificado(
    { nome: "Segurança & Saúde" },
    { nome_completo: "João Álvaro" },
    "scan.png"
  );
  assert.match(nome, /^Certificado_/);
  assert.match(nome, /\.png$/);
  assert.equal(nome.indexOf("&"), -1);
  assert.equal(nome.indexOf("Á"), -1);
});
