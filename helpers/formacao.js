// Regras de negócio do módulo de formação.
// Este ficheiro não importa modelos nem a base de dados: pode ser testado
// isoladamente com `node --test`.

var ESTADOS_CURSO = ["Planeado", "Em_curso", "Concluido", "Cancelado"];
var ESTADOS_INSCRICAO = ["Inscrito", "Concluido", "Abandonou", "Certificado"];

var ROTULOS_ESTADO_INSCRICAO = {
  Inscrito: "Inscrito",
  Concluido: "Concluído",
  Abandonou: "Abandonou",
  Certificado: "Certificado",
};

var EXTENSOES_CERTIFICADO = [".pdf", ".png", ".jpg", ".jpeg"];
var TIPOS_MIME_CERTIFICADO = ["application/pdf", "image/png", "image/jpeg"];

var timestamp = function (valor) {
  if (!valor) return null;
  var t = new Date(valor).getTime();
  return isNaN(t) ? null : t;
};

var numeroOuNulo = function (valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  var n = Number(valor);
  return isNaN(n) ? null : n;
};

// Progresso *estimado* a partir da janela início/fim do curso. Nunca altera o
// estado guardado: serve apenas para o painel mostrar "em curso / em atraso".
// A conclusão real é sempre uma decisão explícita (automática pelo RH ou manual).
var calcularProgresso = function (inscricao, curso, agora) {
  var dados = inscricao || {};
  var dadosCurso = curso || {};
  var estado = dados.estado || "Inscrito";

  if (estado === "Abandonou") {
    return { progresso: 0, em_atraso: false, concluida: false };
  }
  // A data de conclusão pode vir do curso (backfill) mesmo inscrição ainda
  // estar aberta: só o estado/manual indica conclusão real.
  if (estado === "Concluido" || estado === "Certificado" || dados.concluida_manualmente) {
    return { progresso: 100, em_atraso: false, concluida: true };
  }

  var inicio = timestamp(dadosCurso.data_inicio);
  var fim = timestamp(dadosCurso.data_fim);
  if (inicio === null || fim === null || fim <= inicio) {
    return { progresso: 0, em_atraso: false, concluida: false };
  }

  var t = timestamp(agora) || Date.now();
  if (t <= inicio) return { progresso: 0, em_atraso: false, concluida: false };
  if (t >= fim) return { progresso: 99, em_atraso: true, concluida: false };

  return {
    progresso: Math.min(99, Math.max(1, Math.floor(((t - inicio) / (fim - inicio)) * 100))),
    em_atraso: false,
    concluida: false,
  };
};

var validarDadosCurso = function (dados) {
  var corpo = dados || {};
  if (!corpo.nome || !String(corpo.nome).trim()) return "O nome do curso é obrigatório";

  var inicio = timestamp(corpo.data_inicio);
  var fim = timestamp(corpo.data_fim);
  if (inicio !== null && fim !== null && fim < inicio) return "A data de fim não pode ser anterior à data de início";

  if (corpo.horas !== null && corpo.horas !== undefined && corpo.horas !== "") {
    var horas = numeroOuNulo(corpo.horas);
    if (horas === null || horas < 0) return "As horas têm de ser um número não negativo";
  }
  if (corpo.vagas !== null && corpo.vagas !== undefined && corpo.vagas !== "") {
    var vagas = numeroOuNulo(corpo.vagas);
    if (vagas === null || vagas < 0 || Math.floor(vagas) !== vagas) return "As vagas têm de ser um número inteiro não negativo";
  }
  if (corpo.nota_minima_aprovacao !== null && corpo.nota_minima_aprovacao !== undefined && corpo.nota_minima_aprovacao !== "") {
    var minima = numeroOuNulo(corpo.nota_minima_aprovacao);
    if (minima === null || minima < 0 || minima > 20) return "A nota mínima de aprovação tem de estar entre 0 e 20";
  }
  return null;
};

var validarDadosInscricao = function (dados) {
  var corpo = dados || {};
  if (corpo.estado && ESTADOS_INSCRICAO.indexOf(corpo.estado) === -1) return "Estado de inscrição inválido";

  if (corpo.nota_avaliacao !== null && corpo.nota_avaliacao !== undefined && corpo.nota_avaliacao !== "") {
    var nota = numeroOuNulo(corpo.nota_avaliacao);
    if (nota === null || nota < 0 || nota > 20) return "A nota tem de estar entre 0 e 20";
  }
  if (corpo.horas_realizadas !== null && corpo.horas_realizadas !== undefined && corpo.horas_realizadas !== "") {
    var horas = numeroOuNulo(corpo.horas_realizadas);
    if (horas === null || horas < 0) return "As horas realizadas têm de ser um número não negativo";
  }
  return null;
};

// Resultado automático da avaliação: 0-20 e minima configurável no curso
// (por omissão 10 valores, conforme a escala portuguesa).
var calcularResultadoAvaliacao = function (nota, notaMinima) {
  var valor = numeroOuNulo(nota);
  if (valor === null) return null;
  var minima = numeroOuNulo(notaMinima);
  if (minima === null) minima = 10;
  return valor >= minima ? "Aprovado" : "Reprovado";
};

// Regras partilhadas pela criação e pela edição de inscrições. Garante que a
// opção rápida «concluir e certificar» produz o mesmo resultado de preencher
// os campos um a um. `dataAtual` é injectada para facilitar testes.
var aplicarRegrasConclusao = function (alteracoes, existente, dataAtual, curso) {
  var dados = alteracoes || {};
  var actual = Object.assign({}, existente || {}, dados);
  var dadosCurso = curso || {};
  // A data de conclusão e as horas realizadas vêm do curso (data de fim e
  // carga horária), não de campos preenchidos na inscrição.
  var fimCurso = dadosCurso.data_fim ? String(dadosCurso.data_fim).substring(0, 10) : null;
  var manual = actual.concluida_manualmente === true || actual.concluida_manualmente === "true" || actual.concluida_manualmente === "1";

  if (manual) {
    dados.concluida_manualmente = true;
    // Não rebaixe um certificado já atribuído para «Concluído».
    if (actual.estado !== "Certificado") dados.estado = "Concluido";
  }

  var estado = dados.estado || (existente && existente.estado) || "Inscrito";
  var conclusaoGuardada = dados.data_conclusao || (existente && existente.data_conclusao);
  var concluida = estado === "Concluido" || estado === "Certificado";
  if (concluida) {
    if (!conclusaoGuardada) dados.data_conclusao = fimCurso || dataAtual;
    var horas = dados.horas_realizadas !== undefined ? dados.horas_realizadas : (existente && existente.horas_realizadas);
    if ((horas === undefined || horas === null || horas === "") && dadosCurso.horas != null) {
      dados.horas_realizadas = dadosCurso.horas;
    }
  }
  if (estado === "Certificado") {
    dados.certificado = true;
    var certificadoGuardado = dados.data_certificado || (existente && existente.data_certificado);
    if (!certificadoGuardado) dados.data_certificado = dataAtual;
  }
  return dados;
};

var extensaoCertificadoValida = function (nome, tipo) {
  var extensao = String(nome || "").toLowerCase();
  var ponto = extensao.lastIndexOf(".");
  if (ponto === -1 || EXTENSOES_CERTIFICADO.indexOf(extensao.substring(ponto)) === -1) return false;
  var mime = String(tipo || "").toLowerCase();
  return !mime || TIPOS_MIME_CERTIFICADO.indexOf(mime) !== -1;
};

var nomeCertificado = function (curso, colaborador, nomeOriginal) {
  var original = String(nomeOriginal || "certificado.pdf");
  var ponto = original.lastIndexOf(".");
  var extensao = ponto > 0 ? original.substring(ponto).toLowerCase() : ".pdf";
  var limpar = function (valor) {
    return String(valor || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .substring(0, 40);
  };
  var partes = ["Certificado", limpar(curso && curso.nome), limpar(colaborador && colaborador.nome_completo)].filter(Boolean);
  return partes.join("_") + extensao;
};

module.exports = {
  ESTADOS_CURSO,
  ESTADOS_INSCRICAO,
  ROTULOS_ESTADO_INSCRICAO,
  calcularProgresso,
  validarDadosCurso,
  validarDadosInscricao,
  calcularResultadoAvaliacao,
  aplicarRegrasConclusao,
  extensaoCertificadoValida,
  nomeCertificado,
};
