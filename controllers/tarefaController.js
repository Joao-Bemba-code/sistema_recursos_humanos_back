var { Op } = require("sequelize");
var {
  Tarefa,
  TarefaEvento,
  TarefaAlocacao,
  Colaborador,
  Utilizador,
} = require("../models");
var notificacaoController = require("./notificacaoController");
var { perfisUtilizador, fundirPermissoes } = require("../protect/rbac");

var ESTADOS = ["Pendente", "Em_curso", "Atrasada", "Concluida", "Validada", "Cancelada"];
var ESTADOS_ALOCACAO = ["Pendente", "Em_curso", "Reaberta", "Justificativa", "Atrasada", "Concluida", "Validada", "Cancelada"];
// Estados em que a janela ainda esta a contar para o colaborador
var ESTADOS_EM_JANELA = ["Pendente", "Em_curso", "Reaberta"];
var PRIORIDADES = ["Baixa", "Media", "Alta", "Urgente"];
var HORA_VALIDA = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
var NOMES_GESTOR = [
  "administrador geral",
  "director geral",
  "director de recursos humanos",
  "técnico de rh",
  "tecnico de rh",
];

// ==================== UTILITARIOS ====================

// Quem gere tarefas: nivel >= 2 (coordenador/director/admin), permissao
// "create" no modulo tarefas, ou um dos perfis classicos de gestao.
function ehGestorTarefas(utilizador) {
  if (!utilizador) return false;
  var perfis = perfisUtilizador(utilizador);
  var fundido = fundirPermissoes(perfis);
  if (fundido.nivel >= 2) return true;
  if ((fundido.permissoes.tarefas || []).indexOf("create") !== -1) return true;
  return perfis.some(function (p) {
    return p && NOMES_GESTOR.indexOf(String(p.nome).toLowerCase()) !== -1;
  });
}

function pad2(n) {
  return (n < 10 ? "0" : "") + n;
}

function classificarNota(nota) {
  if (nota >= 18) return "Excelente";
  if (nota >= 15) return "Bom";
  if (nota >= 10) return "Suficiente";
  if (nota >= 5) return "Insuficiente";
  return "Mau";
}

// Aceita "AAAA-MM-DDTHH:MM", "AAAA-MM-DD HH:MM" ou ISO completo.
function parseDataJanela(valor, obrigatoria) {
  if (valor === undefined || valor === null || valor === "") {
    if (obrigatoria) return { erro: "A data/hora da janela e obrigatoria" };
    return { valor: null };
  }
  var texto = String(valor).trim().replace(" ", "T");
  var data = new Date(texto);
  if (isNaN(data.getTime())) {
    return { erro: "Data/hora invalida (use AAAA-MM-DDTHH:MM)" };
  }
  return { valor: data };
}

function textoDataCurta(data) {
  if (!data) return "";
  var d = new Date(data);
  return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
    " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}

function textoJanela(aloc) {
  if (!aloc) return "";
  return textoDataCurta(aloc.janela_inicio) + " ate " + textoDataCurta(aloc.janela_fim);
}

// PROGRESSO AUTOMATICO: tempo decorrido dentro da janela / duracao da janela.
// Ninguem escreve o progresso a mao.
function calcularProgresso(aloc, agora) {
  var estado = aloc.estado;
  if (estado === "Cancelada") {
    return Math.max(0, Math.min(100, aloc.progresso || 0));
  }
  if (estado === "Concluida" || estado === "Validada" || estado === "Atrasada") return 100;
  if (estado === "Pendente") return 0;
  var inicio = new Date(aloc.janela_inicio).getTime();
  var fim = new Date(aloc.janela_fim).getTime();
  if (isNaN(inicio) || isNaN(fim) || fim <= inicio) return 0;
  var t = (agora || new Date()).getTime();
  if (t <= inicio) return 0;
  if (t >= fim) return 100;
  return Math.min(99, Math.floor(((t - inicio) / (fim - inicio)) * 100));
}

function estaAtrasada(aloc, agora) {
  if (aloc.estado === "Atrasada") return true;
  if (ESTADOS_EM_JANELA.indexOf(aloc.estado) === -1) return false;
  return new Date(aloc.janela_fim).getTime() < (agora || new Date()).getTime();
}

// ==================== AVALIACAO AUTOMATICA ====================

// Escala de rapidez escolhida pelo utilizador (2026-10-07). Aplica-se
// quando o colaborador CLICA EM TERMINAR (se nunca terminar, a alocacao
// fica "Atrasada" sem nota e o gestor decide):
// - concluiu na 1a metade da janela -> 20
// - concluiu na 2a metade -> 16
// - concluiu nos ultimos 10% do prazo -> 12
// - concluiu depois do prazo (atrasada) -> 5
function notaAutomatica(aloc, agora) {
  var inicio = new Date(aloc.janela_inicio).getTime();
  var fim = new Date(aloc.janela_fim).getTime();
  if (isNaN(inicio) || isNaN(fim) || fim <= inicio) return 16;
  var t = (agora || new Date()).getTime();
  if (t >= fim) return 5; // terminou no fim/fora do prazo: conta como atrasada
  var razao = Math.max(0, t - inicio) / (fim - inicio);
  if (razao <= 0.5) return 20;
  if (razao <= 0.9) return 16;
  return 12;
}

// Preenche os tres indicadores com a nota automatica (avaliado_por = null
// marca a avaliacao como feita pelo sistema; o gestor pode revalidar).
async function avaliarAutomaticamente(aloc, agora) {
  var nota = notaAutomatica(aloc, agora);
  aloc.nota = nota;
  aloc.desempenho = nota;
  aloc.produtividade = nota;
  aloc.cumprimento_prazo = nota;
  aloc.classificacao = classificarNota(nota);
  aloc.avaliado_por = null;
  aloc.avaliado_em = agora || new Date();
  await aloc.save();
  return nota;
}

// Estado da TAREFA derivado das suas alocacoes.
function derivarEstadoTarefa(alocacoes) {
  if (!alocacoes || alocacoes.length === 0) return "Pendente";
  var tem = function (estados) {
    return alocacoes.some(function (a) { return estados.indexOf(a.estado) !== -1; });
  };
  if (tem(["Pendente", "Em_curso", "Reaberta", "Justificativa"])) {
    // Ha trabalho vivo: Pendente puro so se NADA mais aconteceu na tarefa.
    var algumaAvancada = alocacoes.some(function (a) {
      return ["Em_curso", "Reaberta", "Justificativa", "Atrasada", "Concluida", "Validada"].indexOf(a.estado) !== -1;
    });
    return algumaAvancada ? "Em_curso" : "Pendente";
  }
  // Nada vivo: as avaliacoes automaticas ja estao registadas.
  if (tem(["Atrasada"])) return "Atrasada";
  if (tem(["Concluida"])) return "Concluida";
  if (tem(["Validada"])) return "Validada";
  return "Cancelada";
}

async function registrarEvento(tarefaId, utilizadorId, acao, descricao, dados) {
  try {
    await TarefaEvento.create({
      tarefa_id: tarefaId,
      utilizador_id: utilizadorId || null,
      acao: acao,
      descricao: descricao || null,
      dados: dados || null,
    });
  } catch (e) {
    console.log("Aviso: erro ao registar evento de tarefa:", e.message);
  }
}

async function meuColaborador(req) {
  return await Colaborador.findOne({
    where: { utilizador_id: req.utilizador.id, organizacao_id: req.utilizador.organizacao_id },
  });
}

async function notificar(req, utilizadorId, titulo, mensagem, tipo) {
  if (!utilizadorId) return;
  try {
    await notificacaoController.create({
      organizacao_id: req.utilizador.organizacao_id,
      utilizador_id: utilizadorId,
      titulo: titulo,
      mensagem: mensagem,
      tipo: tipo || "info",
      link: "/dashboard/tarefas",
      modulo: "tarefas",
    });
  } catch (e) {
    console.log("Aviso: notificacao de tarefa nao enviada:", e.message);
  }
}

async function notificarGestor(req, tarefa, titulo, mensagem, tipo) {
  if (!tarefa.atribuido_por || String(tarefa.atribuido_por) === String(req.utilizador.id)) return;
  await notificar(req, tarefa.atribuido_por, titulo, mensagem, tipo);
}

function includeColaborador() {
  return {
    model: Colaborador,
    as: "colaborador",
    attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id", "fotografia"],
  };
}

function incluicoes() {
  return [
    includeColaborador(),
    { model: Utilizador, as: "atribuidor", attributes: ["id", "nome_completo"] },
  ];
}

function incluicaoAlocacoes(whereAloc) {
  var definicao = {
    model: TarefaAlocacao,
    as: "alocacoes",
    include: [includeColaborador()],
    order: [["janela_fim", "ASC"]],
  };
  if (whereAloc && Object.keys(whereAloc).length > 0) {
    definicao.where = whereAloc;
    definicao.required = true;
  }
  return definicao;
}

// ==================== DERIVADOS DA TAREFA ====================

// Recalcula estado, progresso medio, prazo, nota media e colaborador
// principal a partir das alocacoes. Emite eventos quando a tarefa muda de
// estado (ex.: ficou toda concluida e aguarda avaliacao).
async function aplicarDerivados(tarefa, alocacoes, req) {
  var alteracoes = {};
  var agora = new Date();

  var novoEstado = derivarEstadoTarefa(alocacoes);
  if (tarefa.estado !== novoEstado) alteracoes.estado = novoEstado;

  var activas = alocacoes.filter(function (a) { return a.estado !== "Cancelada"; });
  if (activas.length > 0) {
    var soma = 0;
    activas.forEach(function (a) { soma += calcularProgresso(a, agora); });
    var media = Math.round(soma / activas.length);
    if (media !== tarefa.progresso) alteracoes.progresso = media;
  }

  var ultimaFim = null;
  alocacoes.forEach(function (a) {
    var fim = new Date(a.janela_fim);
    if (!ultimaFim || fim.getTime() > ultimaFim.getTime()) ultimaFim = fim;
  });
  if (ultimaFim) {
    var dataStr = ultimaFim.getFullYear() + "-" + pad2(ultimaFim.getMonth() + 1) + "-" + pad2(ultimaFim.getDate());
    var horaStr = pad2(ultimaFim.getHours()) + ":" + pad2(ultimaFim.getMinutes());
    if (String(tarefa.prazo || "").slice(0, 10) !== dataStr) alteracoes.prazo = dataStr;
    if (String(tarefa.prazo_hora || "").slice(0, 5) !== horaStr) alteracoes.prazo_hora = horaStr;
  }

  var avaliadas = alocacoes.filter(function (a) {
    return a.estado === "Validada" && a.nota !== null && a.nota !== undefined;
  });
  if (avaliadas.length > 0) {
    var somaNotas = 0;
    avaliadas.forEach(function (a) { somaNotas += parseFloat(a.nota); });
    var mediaNota = Math.round((somaNotas / avaliadas.length) * 100) / 100;
    if (parseFloat(tarefa.nota || 0) !== mediaNota) alteracoes.nota = mediaNota;
    var classificacao = classificarNota(mediaNota);
    if (tarefa.classificacao !== classificacao) alteracoes.classificacao = classificacao;
    var detalhes = "Media de " + avaliadas.length + " colaborador(es) avaliado(s) pelo gestor";
    if (tarefa.avaliacao_detalhes !== detalhes) alteracoes.avaliacao_detalhes = detalhes;
  } else if (tarefa.nota !== null && tarefa.nota !== undefined) {
    alteracoes.nota = null;
    alteracoes.classificacao = null;
    alteracoes.avaliacao_detalhes = null;
  }

  var concluidas = alocacoes.filter(function (a) { return a.data_conclusao; });
  if (concluidas.length > 0) {
    var ultimaConclusao = null;
    concluidas.forEach(function (a) {
      var d = new Date(a.data_conclusao);
      if (!ultimaConclusao || d.getTime() > ultimaConclusao.getTime()) ultimaConclusao = d;
    });
    if (String(tarefa.data_conclusao || "") !== String(ultimaConclusao || "")) {
      alteracoes.data_conclusao = ultimaConclusao;
    }
  } else if (tarefa.data_conclusao) {
    alteracoes.data_conclusao = null;
  }

  var principal = activas[0] || alocacoes[0];
  if (principal && String(tarefa.colaborador_id) !== String(principal.colaborador_id)) {
    alteracoes.colaborador_id = principal.colaborador_id;
  }

  var estadoAnterior = tarefa.estado;
  if (Object.keys(alteracoes).length > 0) {
    await tarefa.update(alteracoes);

    if (req && alteracoes.estado && alteracoes.estado !== estadoAnterior) {
      if (alteracoes.estado === "Concluida") {
        await registrarEvento(
          tarefa.id, null, "concluida",
          "Tarefa concluida - avaliacao automatica registada",
          { estado_anterior: estadoAnterior }
        );
        await notificarGestor(
          req, tarefa, "Tarefa Concluida",
          "A tarefa '" + tarefa.titulo + "' foi concluida e a avaliacao automatica foi registada", "success"
        );
      } else if (alteracoes.estado === "Atrasada") {
        await registrarEvento(
          tarefa.id, null, "atrasada",
          "Tarefa atrasada - janela terminou sem conclusao; aguarda decisao do gestor",
          { estado_anterior: estadoAnterior }
        );
        await notificarGestor(
          req, tarefa, "Tarefa Atrasada",
          "A tarefa '" + tarefa.titulo + "' nao foi concluida dentro da janela - reabra, elimine ou avalie manualmente", "warning"
        );
      } else if (alteracoes.estado === "Validada") {
        await registrarEvento(
          tarefa.id, null, "validada",
          "Tarefa validada - todas as avaliacoes finais estao registadas",
          { estado_anterior: estadoAnterior }
        );
      } else if (alteracoes.estado === "Cancelada") {
        await registrarEvento(
          tarefa.id, null, "cancelada",
          "Tarefa cancelada",
          { estado_anterior: estadoAnterior }
        );
      }
    }
  }
  return tarefa;
}

async function derivarTarefa(tarefaId, req, instancia) {
  var tarefa = instancia || await Tarefa.findByPk(tarefaId);
  if (!tarefa) return null;
  var alocacoes = await TarefaAlocacao.findAll({
    where: { tarefa_id: tarefaId },
    order: [["janela_fim", "ASC"]],
  });
  return aplicarDerivados(tarefa, alocacoes, req);
}

// Fecha as alocacoes cuja janela ja terminou: ficam "Atrasada" SEM avaliacao
// automatica - o colaborador pode justificar e o gestor decide (reabrir,
// eliminar ou avaliar manualmente). Inclui as Pendente que nunca iniciaram.
// Chamado no inicio das leituras - e o "relógio" do sistema.
async function sincronizarJanelas(organizacaoId, req) {
  var agora = new Date();
  var vencidas = await TarefaAlocacao.findAll({
    where: {
      organizacao_id: organizacaoId,
      estado: { [Op.in]: ["Em_curso", "Reaberta", "Pendente"] },
      janela_fim: { [Op.lte]: agora },
    },
    include: [includeColaborador()],
  });
  if (vencidas.length === 0) return 0;

  var tarefasAfetadas = {};
  for (var i = 0; i < vencidas.length; i++) {
    var aloc = vencidas[i];
    aloc.estado = "Atrasada";
    aloc.progresso = 100;
    aloc.data_conclusao = new Date(aloc.janela_fim);
    await aloc.save();

    var nome = aloc.colaborador ? aloc.colaborador.nome_completo : "Colaborador";
    await registrarEvento(
      aloc.tarefa_id, null, "atrasada",
      "Atribuicao de " + nome + " ficou atrasada (janela terminou sem conclusao) - " +
        "sem avaliacao; aguarda decisao do gestor",
      { alocacao_id: aloc.id }
    );
    tarefasAfetadas[aloc.tarefa_id] = true;
  }

  var ids = Object.keys(tarefasAfetadas);
  for (var j = 0; j < ids.length; j++) {
    await derivarTarefa(ids[j], req);
  }
  return ids.length;
}

// Valores calculados no momento da resposta (a barra nunca "congela"
// entre duas leituras). O "atrasada" e calculado pelo cliente a partir da
// janela - evita guardar campos derivados na resposta.
function decorarResposta(tarefa, agora) {
  agora = agora || new Date();
  var alocacoes = tarefa.alocacoes || [];
  var soma = 0;
  var activas = 0;
  alocacoes.forEach(function (a) {
    a.progresso = calcularProgresso(a, agora);
    // DECIMAL volta como texto do MySQL - normaliza para numero na resposta.
    if (a.nota !== null && a.nota !== undefined) a.nota = parseFloat(a.nota);
    if (a.desempenho !== null && a.desempenho !== undefined) a.desempenho = parseFloat(a.desempenho);
    if (a.produtividade !== null && a.produtividade !== undefined) a.produtividade = parseFloat(a.produtividade);
    if (a.cumprimento_prazo !== null && a.cumprimento_prazo !== undefined) a.cumprimento_prazo = parseFloat(a.cumprimento_prazo);
    if (a.estado !== "Cancelada") {
      soma += a.progresso;
      activas++;
    }
  });
  if (activas > 0) tarefa.progresso = Math.round(soma / activas);
  if (tarefa.nota !== null && tarefa.nota !== undefined) tarefa.nota = parseFloat(tarefa.nota);
  return tarefa;
}

// ==================== VALIDACOES DE ENTRADA ====================

// Valida a lista de colaboradores/janelas vindas do pedido.
function validarJanelasEntrada(lista) {
  if (!Array.isArray(lista) || lista.length === 0) {
    return { erro: "Indique pelo menos um colaborador com a sua janela" };
  }
  if (lista.length > 50) {
    return { erro: "Demasiados colaboradores numa mesma tarefa (maximo 50)" };
  }
  var vistas = {};
  var saida = [];
  for (var i = 0; i < lista.length; i++) {
    var item = lista[i] || {};
    if (!item.colaborador_id) {
      return { erro: "Cada colaborador precisa de estar identificado" };
    }
    if (vistas[item.colaborador_id]) {
      return { erro: "O mesmo colaborador aparece mais do que uma vez na tarefa" };
    }
    vistas[item.colaborador_id] = true;

    var inicio = parseDataJanela(item.janela_inicio, true);
    if (inicio.erro) return { erro: inicio.erro };
    var fim = parseDataJanela(item.janela_fim, true);
    if (fim.erro) return { erro: fim.erro };
    if (inicio.valor.getTime() >= fim.valor.getTime()) {
      return { erro: "O fim da janela tem de ser posterior ao inicio" };
    }
    saida.push({
      colaborador_id: item.colaborador_id,
      janela_inicio: inicio.valor,
      janela_fim: fim.valor,
      descricao: item.descricao || item.subtarefa || null,
    });
  }
  return { alocacoes: saida };
}

async function carregarColaboradoresValidos(organizacaoId, ids) {
  var colaboradores = await Colaborador.findAll({
    where: { id: { [Op.in]: ids }, organizacao_id: organizacaoId },
  });
  var mapa = {};
  colaboradores.forEach(function (c) { mapa[c.id] = c; });
  return mapa;
}

// O colaborador so pode actuar nas proprias alocacoes; o gestor em todas.
async function carregarAlocacao(req, tarefa, alocId) {
  var aloc = await TarefaAlocacao.findOne({
    where: { id: alocId, tarefa_id: tarefa.id, organizacao_id: req.utilizador.organizacao_id },
    include: [includeColaborador()],
  });
  if (!aloc) return { erro: { status: 404, mensagem: "Atribuicao nao encontrada" } };

  var gestor = ehGestorTarefas(req.utilizador);
  if (!gestor) {
    var colab = await meuColaborador(req);
    if (!colab || String(colab.id) !== String(aloc.colaborador_id)) {
      return { erro: { status: 403, mensagem: "Sem permissao sobre esta atribuicao" } };
    }
  }
  return { aloc: aloc, gestor: gestor };
}

async function carregarTarefa(req) {
  var tarefa = await Tarefa.findOne({
    where: { id: req.params.id, organizacao_id: req.utilizador.organizacao_id },
    include: incluicoes(),
  });
  if (!tarefa) return { erro: { status: 404, mensagem: "Tarefa nao encontrada" } };

  var gestor = ehGestorTarefas(req.utilizador);
  if (!gestor) {
    var colab = await meuColaborador(req);
    var minha = false;
    if (colab) {
      var total = await TarefaAlocacao.count({
        where: { tarefa_id: tarefa.id, colaborador_id: colab.id },
      });
      minha = total > 0;
    }
    if (!minha) {
      return { erro: { status: 403, mensagem: "Sem permissao para ver esta tarefa" } };
    }
  }
  return { tarefa: tarefa, gestor: gestor };
}

// ==================== LISTAGEM ====================

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page || req.query.pagina, 10) || 1;
    var limit = parseInt(req.query.limit || req.query.limite, 10) || 20;
    if (limit < 1) limit = 20;
    if (limit > 100) limit = 100;
    var offset = (page - 1) * limit;

    var gestor = ehGestorTarefas(req.utilizador);
    await sincronizarJanelas(req.utilizador.organizacao_id, req);

    var where = { organizacao_id: req.utilizador.organizacao_id };
    var whereAloc = {};

    if (!gestor) {
      var colab = await meuColaborador(req);
      if (!colab) {
        return res.status(200).json({
          dados: [],
          paginacao: { total: 0, pagina: page, limite: limit, total_paginas: 0 },
          visao: "colaborador",
        });
      }
      whereAloc.colaborador_id = colab.id;
    } else if (req.query.colaborador_id) {
      whereAloc.colaborador_id = req.query.colaborador_id;
    }

    if (req.query.estado && ESTADOS.indexOf(req.query.estado) !== -1) {
      where.estado = req.query.estado;
    }
    if (req.query.prioridade && PRIORIDADES.indexOf(req.query.prioridade) !== -1) {
      where.prioridade = req.query.prioridade;
    }

    var condicoes = [];
    if (req.query.search) {
      var termo = "%" + req.query.search + "%";
      condicoes.push({
        [Op.or]: [
          { titulo: { [Op.like]: termo } },
          { descricao: { [Op.like]: termo } },
        ],
      });
    }
    if (req.query.prazo_inicio || req.query.prazo_fim) {
      var intervaloPrazo = {};
      if (req.query.prazo_inicio) intervaloPrazo[Op.gte] = req.query.prazo_inicio;
      if (req.query.prazo_fim) intervaloPrazo[Op.lte] = req.query.prazo_fim;
      condicoes.push({ prazo: intervaloPrazo });
    }
    if (condicoes.length > 0) where[Op.and] = condicoes;

    if (req.query.atrasadas === "true" || req.query.atrasadas === "1") {
      // Atrasada = estado persistido pela sincronizacao das janelas.
      whereAloc.estado = "Atrasada";
    }

    var incluicoesLista = [
      includeColaborador(),
      { model: Utilizador, as: "atribuidor", attributes: ["id", "nome_completo"] },
      incluicaoAlocacoes(whereAloc),
    ];

    var resultado = await Tarefa.findAndCountAll({
      where: where,
      include: incluicoesLista,
      order: [["prazo", "ASC"], ["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
      distinct: true,
    });

    var agora = new Date();
    resultado.rows.forEach(function (t) { decorarResposta(t, agora); });

    return res.status(200).json({
      dados: resultado.rows,
      paginacao: {
        total: resultado.count,
        pagina: page,
        limite: limit,
        total_paginas: Math.ceil(resultado.count / limit),
      },
      visao: gestor ? "gestor" : "colaborador",
    });
  } catch (e) {
    console.log("Erro ao listar tarefas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== ESTATISTICAS ====================

var estatisticas = async function (req, res) {
  try {
    var gestor = ehGestorTarefas(req.utilizador);
    await sincronizarJanelas(req.utilizador.organizacao_id, req);

    var where = { organizacao_id: req.utilizador.organizacao_id };
    var whereAloc = {};
    var meuId = null;

    if (!gestor) {
      var colab = await meuColaborador(req);
      if (!colab) {
        return res.status(200).json({
          dados: { total: 0, por_estado: {}, atrasadas: 0, nota_media: null, progresso_medio: 0, visao: "colaborador" },
        });
      }
      meuId = colab.id;
      whereAloc.colaborador_id = colab.id;
    }

    var tarefas = await Tarefa.findAll({
      where: where,
      attributes: ["id", "estado", "prazo", "prazo_hora", "nota", "progresso"],
      include: [incluicaoAlocacoes(whereAloc)],
      order: [["prazo", "ASC"]],
    });

    var agora = new Date();
    var porEstado = {};
    ESTADOS.forEach(function (e) { porEstado[e] = 0; });
    var atrasadas = 0;
    var somaNotas = 0;
    var totalNotas = 0;
    var somaProgresso = 0;

    tarefas.forEach(function (t) {
      decorarResposta(t, agora);
      porEstado[t.estado] = (porEstado[t.estado] || 0) + 1;
      somaProgresso += t.progresso || 0;

      if (meuId) {
        // Visao do colaborador: a nota e a media das SUAS avaliacoes.
        t.alocacoes.forEach(function (a) {
          if (a.nota !== null && a.nota !== undefined) {
            somaNotas += parseFloat(a.nota);
            totalNotas++;
          }
        });
      } else if (t.nota !== null && t.nota !== undefined) {
        somaNotas += parseFloat(t.nota);
        totalNotas++;
      }

      if (t.alocacoes.some(function (a) { return estaAtrasada(a, agora); })) atrasadas++;
    });

    return res.status(200).json({
      dados: {
        total: tarefas.length,
        por_estado: porEstado,
        atrasadas: atrasadas,
        nota_media: totalNotas > 0 ? Math.round((somaNotas / totalNotas) * 100) / 100 : null,
        progresso_medio: tarefas.length > 0 ? Math.round(somaProgresso / tarefas.length) : 0,
        visao: gestor ? "gestor" : "colaborador",
      },
    });
  } catch (e) {
    console.log("Erro ao calcular estatisticas de tarefas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== DETALHE ====================

var getById = async function (req, res) {
  try {
    await sincronizarJanelas(req.utilizador.organizacao_id, req);

    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });

    var tarefa = await Tarefa.findOne({
      where: { id: ctx.tarefa.id, organizacao_id: req.utilizador.organizacao_id },
      include: incluicoes().concat([
        incluicaoAlocacoes(),
        {
          model: TarefaEvento,
          as: "eventos",
          include: [{ model: Utilizador, as: "utilizador", attributes: ["id", "nome_completo"] }],
          order: [["createdAt", "DESC"]],
        },
      ]),
    });

    if (!tarefa) return res.status(404).json({ error: "Tarefa nao encontrada" });
    await derivarTarefa(tarefa.id, req, tarefa);
    decorarResposta(tarefa);

    return res.status(200).json({ dados: tarefa });
  } catch (e) {
    console.log("Erro ao obter tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== CRIAR (gestor) ====================

var create = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem atribuir tarefas" });
    }

    var dados = req.body;
    if (!dados.titulo || !String(dados.titulo).trim()) {
      return res.status(400).json({ error: "O titulo da tarefa e obrigatorio" });
    }
    if (dados.prioridade && PRIORIDADES.indexOf(dados.prioridade) === -1) {
      return res.status(400).json({ error: "Prioridade invalida" });
    }

    // Compatibilidade: uma unica janela a partir de colaborador + prazo.
    var listaJanelas = dados.alocacoes;
    if ((!Array.isArray(listaJanelas) || listaJanelas.length === 0) && dados.colaborador_id) {
      var inicio = new Date();
      var fim = null;
      if (dados.prazo) {
        var partes = String(dados.prazo).slice(0, 10).split("-");
        var hora = dados.prazo_hora ? String(dados.prazo_hora).slice(0, 5).split(":") : ["23", "59"];
        fim = new Date(
          Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]),
          Number(hora[0]) || 0, Number(hora[1]) || 0, 0, 0
        );
      }
      if (!fim || fim.getTime() <= inicio.getTime()) {
        fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
      }
      listaJanelas = [{
        colaborador_id: dados.colaborador_id,
        janela_inicio: textoDataCurta(inicio),
        janela_fim: textoDataCurta(fim),
      }];
    }

    var validacao = validarJanelasEntrada(listaJanelas);
    if (validacao.erro) return res.status(400).json({ error: validacao.erro });

    var mapaColabs = await carregarColaboradoresValidos(
      req.utilizador.organizacao_id,
      validacao.alocacoes.map(function (a) { return a.colaborador_id; })
    );
    for (var i = 0; i < validacao.alocacoes.length; i++) {
      if (!mapaColabs[validacao.alocacoes[i].colaborador_id]) {
        return res.status(404).json({ error: "Colaborador nao encontrado" });
      }
    }

    var primeira = validacao.alocacoes[0];
    var ultimaFim = null;
    validacao.alocacoes.forEach(function (a) {
      if (!ultimaFim || a.janela_fim.getTime() > ultimaFim.getTime()) ultimaFim = a.janela_fim;
    });

    var tarefa = await Tarefa.create({
      organizacao_id: req.utilizador.organizacao_id,
      colaborador_id: primeira.colaborador_id,
      atribuido_por: req.utilizador.id,
      titulo: String(dados.titulo).trim().slice(0, 200),
      descricao: dados.descricao || null,
      prazo: ultimaFim.getFullYear() + "-" + pad2(ultimaFim.getMonth() + 1) + "-" + pad2(ultimaFim.getDate()),
      prazo_hora: pad2(ultimaFim.getHours()) + ":" + pad2(ultimaFim.getMinutes()),
      prioridade: dados.prioridade || "Media",
      estado: "Pendente",
      progresso: 0,
    });

    for (var j = 0; j < validacao.alocacoes.length; j++) {
      var entrada = validacao.alocacoes[j];
      await TarefaAlocacao.create({
        organizacao_id: req.utilizador.organizacao_id,
        tarefa_id: tarefa.id,
        colaborador_id: entrada.colaborador_id,
        atribuido_por: req.utilizador.id,
        descricao: entrada.descricao || null,
        estado: "Pendente",
        janela_inicio: entrada.janela_inicio,
        janela_fim: entrada.janela_fim,
        progresso: 0,
      });
    }

    var nomes = validacao.alocacoes.map(function (a) {
      return mapaColabs[a.colaborador_id].nome_completo;
    });
    await registrarEvento(
      tarefa.id,
      req.utilizador.id,
      "criada",
      req.utilizador.nome_completo + " atribuiu a tarefa a " + nomes.join(", "),
      {
        colaboradores: validacao.alocacoes.map(function (a) {
          return {
            colaborador_id: a.colaborador_id,
            janela_inicio: textoDataCurta(a.janela_inicio),
            janela_fim: textoDataCurta(a.janela_fim),
          };
        }),
        prioridade: tarefa.prioridade,
      }
    );

    for (var k = 0; k < validacao.alocacoes.length; k++) {
      var entradaN = validacao.alocacoes[k];
      var colabN = mapaColabs[entradaN.colaborador_id];
      await notificar(
        req,
        colabN.utilizador_id,
        "Nova Tarefa",
        "Foi-lhe atribuida a tarefa: " + tarefa.titulo +
          " (janela: " + textoDataCurta(entradaN.janela_inicio) + " ate " + textoDataCurta(entradaN.janela_fim) + ")",
        "info"
      );
    }

    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    return res.status(201).json({ mensagem: "Tarefa atribuida com sucesso", dados: resultado });
  } catch (e) {
    console.log("Erro ao criar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== EDITAR TAREFA (gestor, a qualquer momento) ====================

var update = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem editar tarefas" });
    }

    var tarefa = await Tarefa.findOne({
      where: { id: req.params.id, organizacao_id: req.utilizador.organizacao_id },
      include: incluicoes(),
    });
    if (!tarefa) return res.status(404).json({ error: "Tarefa nao encontrada" });

    var dados = req.body;
    var alteracoes = {};

    if (dados.titulo !== undefined && String(dados.titulo).trim()) {
      alteracoes.titulo = String(dados.titulo).trim().slice(0, 200);
    }
    if (dados.descricao !== undefined) alteracoes.descricao = dados.descricao || null;
    if (dados.prioridade !== undefined) {
      if (PRIORIDADES.indexOf(dados.prioridade) === -1) {
        return res.status(400).json({ error: "Prioridade invalida" });
      }
      alteracoes.prioridade = dados.prioridade;
    }

    if (Object.keys(alteracoes).length === 0) {
      return res.status(400).json({ error: "Nenhuma alteracao para guardar" });
    }

    await tarefa.update(alteracoes);

    await registrarEvento(
      tarefa.id,
      req.utilizador.id,
      "editada",
      req.utilizador.nome_completo + " actualizou a tarefa",
      alteracoes
    );

    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    return res.status(200).json({ mensagem: "Tarefa actualizada com sucesso", dados: resultado });
  } catch (e) {
    console.log("Erro ao editar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== ALOCACOES: adicionar / editar / remover (gestor) ====================

var adicionarAlocacoes = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem atribuir colaboradores" });
    }
    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });
    var tarefa = ctx.tarefa;
    if (tarefa.estado === "Cancelada") {
      return res.status(400).json({ error: "Nao e possivel atribuir colaboradores a uma tarefa cancelada" });
    }

    var validacao = validarJanelasEntrada(req.body.alocacoes);
    if (validacao.erro) return res.status(400).json({ error: validacao.erro });

    var mapaColabs = await carregarColaboradoresValidos(
      req.utilizador.organizacao_id,
      validacao.alocacoes.map(function (a) { return a.colaborador_id; })
    );
    var existentes = await TarefaAlocacao.findAll({
      where: { tarefa_id: tarefa.id, estado: { [Op.ne]: "Cancelada" } },
    });

    for (var i = 0; i < validacao.alocacoes.length; i++) {
      var entrada = validacao.alocacoes[i];
      if (!mapaColabs[entrada.colaborador_id]) {
        return res.status(404).json({ error: "Colaborador nao encontrado" });
      }
      var repetido = existentes.some(function (a) {
        return String(a.colaborador_id) === String(entrada.colaborador_id);
      });
      if (repetido) {
        return res.status(400).json({ error: "Ja existe um colaborador atribuido com essa identificacao nesta tarefa" });
      }
    }

    var criadas = [];
    for (var j = 0; j < validacao.alocacoes.length; j++) {
      var nova = await TarefaAlocacao.create({
        organizacao_id: req.utilizador.organizacao_id,
        tarefa_id: tarefa.id,
        colaborador_id: validacao.alocacoes[j].colaborador_id,
        atribuido_por: req.utilizador.id,
        descricao: validacao.alocacoes[j].descricao || null,
        estado: "Pendente",
        janela_inicio: validacao.alocacoes[j].janela_inicio,
        janela_fim: validacao.alocacoes[j].janela_fim,
        progresso: 0,
      });
      criadas.push(nova);

      var colab = mapaColabs[validacao.alocacoes[j].colaborador_id];
      await registrarEvento(
        tarefa.id, req.utilizador.id, "editada",
        req.utilizador.nome_completo + " atribuiu a tarefa a " + colab.nome_completo +
          " (janela: " + textoDataCurta(validacao.alocacoes[j].janela_inicio) + " ate " +
          textoDataCurta(validacao.alocacoes[j].janela_fim) + ")"
      );
      await notificar(req, colab.utilizador_id, "Nova Tarefa", "Foi-lhe atribuida a tarefa: " + tarefa.titulo, "info");
    }

    await derivarTarefa(tarefa.id, req);
    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    return res.status(201).json({ mensagem: "Colaborador(es) atribuido(s) com sucesso", dados: resultado });
  } catch (e) {
    console.log("Erro ao adicionar alocacoes:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Editar janela e/ou reatribuir a outro colaborador - a qualquer momento.
var editarAlocacao = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem editar atribuicoes" });
    }
    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });
    var tarefa = ctx.tarefa;

    var carregada = await carregarAlocacao(req, tarefa, req.params.alocId);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    var aloc = carregada.aloc;
    if (aloc.estado === "Cancelada") {
      return res.status(400).json({ error: "Esta atribuicao esta cancelada e nao pode ser editada" });
    }

    var dados = req.body;
    var alteracoes = {};
    var descricao = [];

    if (dados.colaborador_id && String(dados.colaborador_id) !== String(aloc.colaborador_id)) {
      var novos = await carregarColaboradoresValidos(req.utilizador.organizacao_id, [dados.colaborador_id]);
      if (!novos[dados.colaborador_id]) return res.status(404).json({ error: "Colaborador nao encontrado" });

      var duplicado = await TarefaAlocacao.count({
        where: {
          tarefa_id: tarefa.id,
          colaborador_id: dados.colaborador_id,
          estado: { [Op.ne]: "Cancelada" },
          id: { [Op.ne]: aloc.id },
        },
      });
      if (duplicado > 0) {
        return res.status(400).json({ error: "Esse colaborador ja esta atribuido a esta tarefa" });
      }

      var anterior = aloc.colaborador;
      alteracoes.colaborador_id = dados.colaborador_id;
      alteracoes.estado = "Pendente";
      alteracoes.data_inicio = null;
      alteracoes.data_conclusao = null;
      alteracoes.progresso = 0;
      alteracoes.justificativa = null;
      alteracoes.justificativa_decisao = null;
      alteracoes.justificativa_data = null;
      alteracoes.nota = null;
      alteracoes.desempenho = null;
      alteracoes.produtividade = null;
      alteracoes.cumprimento_prazo = null;
      alteracoes.classificacao = null;
      alteracoes.observacoes = null;
      alteracoes.avaliado_por = null;
      alteracoes.avaliado_em = null;
      descricao.push(
        "reatribuiu de " + (anterior ? anterior.nome_completo : "colaborador anterior") +
        " para " + novos[dados.colaborador_id].nome_completo
      );
      await notificar(
        req, novos[dados.colaborador_id].utilizador_id, "Nova Tarefa",
        "Foi-lhe atribuida a tarefa: " + tarefa.titulo, "info"
      );
    }

    // Subtarefa: o que este colaborador deve fazer dentro da tarefa.
    if (dados.descricao !== undefined) {
      alteracoes.descricao = String(dados.descricao || "").trim().slice(0, 500) || null;
      descricao.push("ajustou a descricao da subtarefa");
    }

    var alterarJanela = dados.janela_inicio !== undefined || dados.janela_fim !== undefined;
    if (alterarJanela) {
      if (aloc.estado === "Concluida" || aloc.estado === "Validada") {
        return res.status(400).json({
          error: "Para alterar a janela de uma tarefa concluida ou validada, use a reabertura",
        });
      }
      var inicio = dados.janela_inicio !== undefined
        ? parseDataJanela(dados.janela_inicio, true)
        : { valor: new Date(aloc.janela_inicio) };
      if (inicio.erro) return res.status(400).json({ error: inicio.erro });
      var fim = dados.janela_fim !== undefined
        ? parseDataJanela(dados.janela_fim, true)
        : { valor: new Date(aloc.janela_fim) };
      if (fim.erro) return res.status(400).json({ error: fim.erro });
      if (inicio.valor.getTime() >= fim.valor.getTime()) {
        return res.status(400).json({ error: "O fim da janela tem de ser posterior ao inicio" });
      }
      alteracoes.janela_inicio = inicio.valor;
      alteracoes.janela_fim = fim.valor;
      descricao.push("ajustou a janela para " + textoDataCurta(inicio.valor) + " ate " + textoDataCurta(fim.valor));
    }

    if (Object.keys(alteracoes).length === 0) {
      return res.status(400).json({ error: "Nenhuma alteracao para guardar" });
    }

    await aloc.update(alteracoes);
    await registrarEvento(
      tarefa.id, req.utilizador.id,
      alteracoes.colaborador_id ? "reatribuida" : "editada",
      req.utilizador.nome_completo + " " + descricao.join(" e ") +
        " (tarefa de " + (aloc.colaborador ? aloc.colaborador.nome_completo : "colaborador") + ")"
    );

    await derivarTarefa(tarefa.id, req);
    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    return res.status(200).json({ mensagem: "Atribuicao actualizada", dados: resultado });
  } catch (e) {
    console.log("Erro ao editar alocacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Cancela a participacao de um colaborador (sem penalizacao) - gestor.
var removerAlocacao = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem remover colaboradores" });
    }
    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });
    var tarefa = ctx.tarefa;

    var carregada = await carregarAlocacao(req, tarefa, req.params.alocId);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    var aloc = carregada.aloc;
    if (aloc.estado === "Cancelada") {
      return res.status(400).json({ error: "Esta atribuicao ja esta cancelada" });
    }

    aloc.progresso = calcularProgresso(aloc, new Date());
    aloc.estado = "Cancelada";
    await aloc.save();

    await registrarEvento(
      tarefa.id, req.utilizador.id, "cancelada",
      req.utilizador.nome_completo + " cancelou a participacao de " +
        (aloc.colaborador ? aloc.colaborador.nome_completo : "um colaborador") + " na tarefa"
    );
    await notificar(
      req, aloc.colaborador ? aloc.colaborador.utilizador_id : null,
      "Tarefa Cancelada", "A sua participacao na tarefa '" + tarefa.titulo + "' foi cancelada", "warning"
    );

    await derivarTarefa(tarefa.id, req);
    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    return res.status(200).json({ mensagem: "Participacao cancelada", dados: resultado });
  } catch (e) {
    console.log("Erro ao remover alocacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== INICIAR (colaborador) ====================

async function iniciarAlocacaoInterna(req, tarefa, aloc) {
  if (aloc.estado !== "Pendente") {
    return { erro: "Apenas atribuicoes pendentes podem ser iniciadas" };
  }
  aloc.estado = "Em_curso";
  aloc.data_inicio = new Date();
  await aloc.save();

  await registrarEvento(
    tarefa.id, req.utilizador.id, "iniciada",
    req.utilizador.nome_completo + " iniciou a tarefa" +
      (aloc.colaborador && String(aloc.colaborador.nome_completo) !== String(req.utilizador.nome_completo)
        ? " (" + aloc.colaborador.nome_completo + ")" : ""),
    { janela: textoJanela(aloc) }
  );
  await derivarTarefa(tarefa.id, req);
  return {};
}

var iniciarAlocacao = async function (req, res) {
  try {
    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });

    var carregada = await carregarAlocacao(req, ctx.tarefa, req.params.alocId);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });

    var erro = await iniciarAlocacaoInterna(req, ctx.tarefa, carregada.aloc);
    if (erro.erro) return res.status(400).json({ error: erro.erro });

    var resultado = await Tarefa.findByPk(ctx.tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    decorarResposta(resultado);
    return res.status(200).json({ mensagem: "Tarefa iniciada", dados: resultado });
  } catch (e) {
    console.log("Erro ao iniciar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Compatibilidade: PUT /:id/iniciar (sem identificar a atribuicao).
var iniciar = async function (req, res) {
  try {
    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });

    var alocId = req.body && req.body.alocacao_id;
    if (alocId) {
      var carregada = await carregarAlocacao(req, ctx.tarefa, alocId);
      if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
      var erro1 = await iniciarAlocacaoInterna(req, ctx.tarefa, carregada.aloc);
      if (erro1.erro) return res.status(400).json({ error: erro1.erro });
      var r1 = await Tarefa.findByPk(ctx.tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
      decorarResposta(r1);
      return res.status(200).json({ mensagem: "Tarefa iniciada", dados: r1 });
    }

    if (ctx.gestor) {
      return res.status(400).json({ error: "Identifique qual dos colaboradores vai iniciar a tarefa" });
    }
    var colab = await meuColaborador(req);
    if (!colab) return res.status(403).json({ error: "Sem permissao para iniciar esta tarefa" });

    var pendentes = await TarefaAlocacao.findAll({
      where: { tarefa_id: ctx.tarefa.id, colaborador_id: colab.id, estado: "Pendente" },
      include: [includeColaborador()],
    });
    if (pendentes.length === 0) {
      return res.status(400).json({ error: "Nao ha atribuicoes pendentes para si nesta tarefa" });
    }
    if (pendentes.length > 1) {
      return res.status(400).json({ error: "Tem mais do que uma atribuicao nesta tarefa - identifique a janela" });
    }

    var erro2 = await iniciarAlocacaoInterna(req, ctx.tarefa, pendentes[0]);
    if (erro2.erro) return res.status(400).json({ error: erro2.erro });

    var r2 = await Tarefa.findByPk(ctx.tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    decorarResposta(r2);
    return res.status(200).json({ mensagem: "Tarefa iniciada", dados: r2 });
  } catch (e) {
    console.log("Erro ao iniciar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== TERMINAR (colaborador conclui; avaliacao automatica) ====================

// O colaborador marca o trabalho como terminado. O sistema avalia
// automaticamente pela rapidez (1a metade=20, 2a metade=16, ultimos 10%=12;
// fora do prazo=5). Se o colaborador NAO terminar, a janela expira para
// "Atrasada" SEM nota e o gestor decide (reabrir/eliminar/avaliar manual).
// O gestor pode reavaliar depois.
var terminar = async function (req, res) {
  try {
    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });

    var carregada = await carregarAlocacao(req, ctx.tarefa, req.params.alocId);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    var aloc = carregada.aloc;

    if (["Em_curso", "Reaberta"].indexOf(aloc.estado) === -1) {
      return res.status(400).json({
        error: "Apenas atribuicoes em curso podem ser terminadas (estado actual: " + aloc.estado + ")",
      });
    }

    var agora = new Date();
    var nome = aloc.colaborador ? aloc.colaborador.nome_completo : "Colaborador";
    var fim = new Date(aloc.janela_fim).getTime();

    if (agora.getTime() > fim) {
      // Fora do prazo: conta como atrasada.
      aloc.estado = "Atrasada";
      aloc.progresso = 100;
      aloc.data_conclusao = new Date(aloc.janela_fim);
      await avaliarAutomaticamente(aloc, agora);
      await registrarEvento(
        ctx.tarefa.id, req.utilizador.id, "terminada",
        nome + " marcou a tarefa como terminada, mas fora do prazo - " +
          "avaliacao automatica " + aloc.nota + "/20 (" + aloc.classificacao + ")",
        { alocacao_id: aloc.id, nota: aloc.nota, atrasada: true, automatica: true }
      );
    } else {
      aloc.estado = "Concluida";
      aloc.progresso = 100;
      aloc.data_conclusao = agora;
      await avaliarAutomaticamente(aloc, agora);
      await registrarEvento(
        ctx.tarefa.id, req.utilizador.id, "terminada",
        nome + " marcou a tarefa como terminada - " +
          "avaliacao automatica " + aloc.nota + "/20 (" + aloc.classificacao + ")",
        { alocacao_id: aloc.id, nota: aloc.nota, automatica: true }
      );
    }

    await derivarTarefa(ctx.tarefa.id, req);
    var resultado = await Tarefa.findByPk(ctx.tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    decorarResposta(resultado);
    return res.status(200).json({
      mensagem: aloc.estado === "Atrasada"
        ? "Tarefa terminada fora do prazo - avaliacao automatica " + aloc.nota + "/20"
        : "Tarefa terminada - avaliacao automatica " + aloc.nota + "/20",
      dados: resultado,
    });
  } catch (e) {
    console.log("Erro ao terminar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== JUSTIFICATIVA (colaborador) ====================

var justificarAlocacao = async function (req, res) {
  try {
    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });
    if (ctx.gestor) {
      return res.status(403).json({ error: "A justificativa e apresentada pelo colaborador atribuido" });
    }

    var carregada = await carregarAlocacao(req, ctx.tarefa, req.params.alocId);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    var aloc = carregada.aloc;

    if (["Pendente", "Em_curso", "Reaberta", "Atrasada"].indexOf(aloc.estado) === -1) {
      return res.status(400).json({ error: "Esta atribuicao nao pode receber uma justificativa" });
    }
    var motivo = req.body && req.body.motivo ? String(req.body.motivo).trim() : "";
    if (!motivo) {
      return res.status(400).json({ error: "Escreva o motivo da justificativa" });
    }
    if (motivo.length < 10) {
      return res.status(400).json({ error: "A justificativa e demasiado curta - detalhe o motivo" });
    }

    aloc.estado = "Justificativa";
    aloc.justificativa = motivo.slice(0, 2000);
    aloc.justificativa_data = new Date();
    aloc.justificativa_decisao = null;
    await aloc.save();

    await registrarEvento(
      ctx.tarefa.id, req.utilizador.id, "justificativa",
      req.utilizador.nome_completo + " apresentou justificativa: " + aloc.justificativa,
      { janela: textoJanela(aloc) }
    );
    await notificarGestor(
      req, ctx.tarefa, "Justificativa Pendente",
      req.utilizador.nome_completo + " apresentou justificativa na tarefa '" + ctx.tarefa.titulo + "'",
      "warning"
    );

    await derivarTarefa(ctx.tarefa.id, req);
    var resultado = await Tarefa.findByPk(ctx.tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    decorarResposta(resultado);
    return res.status(200).json({ mensagem: "Justificativa enviada - aguarda decisao do gestor", dados: resultado });
  } catch (e) {
    console.log("Erro ao enviar justificativa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== DECISAO DA JUSTIFICATIVA (gestor) ====================

var decidirJustificativa = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores decidem justificativas" });
    }
    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });
    var tarefa = ctx.tarefa;

    var carregada = await carregarAlocacao(req, tarefa, req.params.alocId);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    var aloc = carregada.aloc;

    if (aloc.estado !== "Justificativa") {
      return res.status(400).json({ error: "Esta atribuicao nao tem justificativa pendente" });
    }

    var decisao = req.body && req.body.decisao;
    if (decisao !== "aceitar" && decisao !== "rejeitar") {
      return res.status(400).json({ error: "Decisao invalida (aceitar ou rejeitar)" });
    }
    var observacoes = req.body && req.body.observacoes ? String(req.body.observacoes).trim().slice(0, 2000) : null;
    var nomeColab = aloc.colaborador ? aloc.colaborador.nome_completo : "o colaborador";

    if (decisao === "aceitar") {
      aloc.estado = "Cancelada";
      aloc.progresso = calcularProgresso(aloc, new Date());
      aloc.justificativa_decisao = observacoes;
      aloc.justificativa_data = new Date();
      // Sem penalizacao: apaga qualquer avaliacao automatica existente
      // (ex.: justificativa aceite depois de a janela ter terminado).
      aloc.nota = null;
      aloc.desempenho = null;
      aloc.produtividade = null;
      aloc.cumprimento_prazo = null;
      aloc.classificacao = null;
      aloc.avaliado_por = null;
      aloc.avaliado_em = null;
      await aloc.save();

      await registrarEvento(
        tarefa.id, req.utilizador.id, "justificativa_aceita",
        req.utilizador.nome_completo + " aceitou a justificativa de " + nomeColab +
          " - participacao cancelada sem penalizacao" +
          (observacoes ? " (" + observacoes + ")" : "")
      );
      await notificar(
        req, aloc.colaborador ? aloc.colaborador.utilizador_id : null,
        "Justificativa Aceite",
        "A sua justificativa na tarefa '" + tarefa.titulo + "' foi aceite. Participacao cancelada sem penalizacao.",
        "success"
      );

      // Reatribuicao opcional: a tarefa passa para outro colaborador.
      if (req.body && req.body.novo_colaborador_id) {
        var validacao = validarJanelasEntrada([{
          colaborador_id: req.body.novo_colaborador_id,
          janela_inicio: req.body.janela_inicio,
          janela_fim: req.body.janela_fim,
        }]);
        if (validacao.erro) return res.status(400).json({ error: validacao.erro });

        var mapa = await carregarColaboradoresValidos(req.utilizador.organizacao_id, [req.body.novo_colaborador_id]);
        if (!mapa[req.body.novo_colaborador_id]) return res.status(404).json({ error: "Colaborador nao encontrado" });

        var novo = await TarefaAlocacao.create({
          organizacao_id: req.utilizador.organizacao_id,
          tarefa_id: tarefa.id,
          colaborador_id: req.body.novo_colaborador_id,
          atribuido_por: req.utilizador.id,
          estado: "Pendente",
          janela_inicio: validacao.alocacoes[0].janela_inicio,
          janela_fim: validacao.alocacoes[0].janela_fim,
          progresso: 0,
        });
        await registrarEvento(
          tarefa.id, req.utilizador.id, "reatribuida",
          req.utilizador.nome_completo + " reatribuiu a tarefa a " + mapa[req.body.novo_colaborador_id].nome_completo +
            " (janela: " + textoDataCurta(novo.janela_inicio) + " ate " + textoDataCurta(novo.janela_fim) + ")"
        );
        await notificar(
          req, mapa[req.body.novo_colaborador_id].utilizador_id, "Nova Tarefa",
          "Foi-lhe atribuida a tarefa: " + tarefa.titulo, "info"
        );
      }

      await derivarTarefa(tarefa.id, req);
      var resultado1 = await Tarefa.findByPk(tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
      decorarResposta(resultado1);
      return res.status(200).json({ mensagem: "Justificativa aceite", dados: resultado1 });
    }

    // Rejeitada: volta a contar (ou mantem-se atrasada se a janela ja passou).
    var fim = new Date(aloc.janela_fim).getTime();
    var estadoAnterior = fim > Date.now()
      ? (aloc.data_inicio ? "Em_curso" : "Pendente")
      : "Atrasada";
    aloc.estado = estadoAnterior;
    aloc.justificativa_decisao = observacoes;
    aloc.justificativa_data = new Date();
    await aloc.save();

    await registrarEvento(
      tarefa.id, req.utilizador.id, "justificativa_rejeitada",
      req.utilizador.nome_completo + " rejeitou a justificativa de " + nomeColab +
        " - a tarefa continua" + (observacoes ? " (" + observacoes + ")" : "")
    );
    await notificar(
      req, aloc.colaborador ? aloc.colaborador.utilizador_id : null,
      "Justificativa Rejeitada",
      "A sua justificativa na tarefa '" + tarefa.titulo + "' foi rejeitada. A tarefa continua e o prazo continua a contar.",
      "warning"
    );

    // A janela pode ter terminado entao - a conclusao e automatica.
    await sincronizarJanelas(req.utilizador.organizacao_id, req);
    await derivarTarefa(tarefa.id, req);
    var resultado2 = await Tarefa.findByPk(tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    decorarResposta(resultado2);
    return res.status(200).json({ mensagem: "Justificativa rejeitada - tarefa em curso", dados: resultado2 });
  } catch (e) {
    console.log("Erro ao decidir justificativa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== PROGRESSO: apenas automatico ====================

var progresso = async function (req, res) {
  return res.status(400).json({
    error: "O progresso e automatico: calculado pelo tempo decorrido dentro da janela. Nao pode ser alterado a mao.",
  });
};

// ==================== AVALIAR / VALIDAR (gestor, nota POR COLABORADOR) ====================

var validar = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem avaliar tarefas" });
    }

    // Compatibilidade: reabrir via /validar.
    if (req.body && req.body.acao === "reabrir") {
      return reabrir(req, res);
    }

    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });
    var tarefa = ctx.tarefa;

    var avaliacoes = req.body && req.body.avaliacoes;
    if (!Array.isArray(avaliacoes) || avaliacoes.length === 0) {
      return res.status(400).json({ error: "Indique a nota de cada colaborador a avaliar" });
    }

    var alocacoes = await TarefaAlocacao.findAll({
      where: { tarefa_id: tarefa.id },
      include: [includeColaborador()],
    });
    var mapa = {};
    alocacoes.forEach(function (a) { mapa[a.id] = a; });

    var avaliadas = [];
    for (var i = 0; i < avaliacoes.length; i++) {
      var entrada = avaliacoes[i] || {};
      var aloc = mapa[entrada.alocacao_id];
      if (!aloc) return res.status(404).json({ error: "Atribuicao nao encontrada nesta tarefa" });
      if (aloc.estado !== "Concluida" && aloc.estado !== "Atrasada") {
        return res.status(400).json({
          error: "Atribuicao de " + (aloc.colaborador ? aloc.colaborador.nome_completo : "colaborador") +
            " nao esta concluida (estado actual: " + aloc.estado + ")",
        });
      }

      // Indicadores de avaliacao (0-20 cada): desempenho, produtividade e
      // cumprimento do prazo. A nota final e a media dos tres, calculada
      // pelo sistema. Aceita tambem uma nota directa (compatibilidade).
      var temIndicadores = entrada.desempenho !== undefined || entrada.produtividade !== undefined ||
        entrada.cumprimento_prazo !== undefined;

      if (temIndicadores) {
        var desempenho = entrada.desempenho === null || entrada.desempenho === undefined || entrada.desempenho === ""
          ? NaN : parseFloat(entrada.desempenho);
        var produtividade = entrada.produtividade === null || entrada.produtividade === undefined || entrada.produtividade === ""
          ? NaN : parseFloat(entrada.produtividade);
        var cumprimento = entrada.cumprimento_prazo === null || entrada.cumprimento_prazo === undefined || entrada.cumprimento_prazo === ""
          ? NaN : parseFloat(entrada.cumprimento_prazo);
        if (isNaN(desempenho) || isNaN(produtividade) || isNaN(cumprimento) ||
            desempenho < 0 || desempenho > 20 || produtividade < 0 || produtividade > 20 ||
            cumprimento < 0 || cumprimento > 20) {
          return res.status(400).json({
            error: "Indicadores invalidos: desempenho, produtividade e cumprimento do prazo de 0 a 20",
          });
        }
        desempenho = Math.round(desempenho * 100) / 100;
        produtividade = Math.round(produtividade * 100) / 100;
        cumprimento = Math.round(cumprimento * 100) / 100;
        var notaFinal = Math.round(((desempenho + produtividade + cumprimento) / 3) * 100) / 100;
        aloc.desempenho = desempenho;
        aloc.produtividade = produtividade;
        aloc.cumprimento_prazo = cumprimento;
        aloc.nota = notaFinal;
      } else {
        var nota = entrada.nota === null || entrada.nota === undefined || entrada.nota === ""
          ? NaN : parseFloat(entrada.nota);
        if (isNaN(nota) || nota < 0 || nota > 20) {
          return res.status(400).json({ error: "Nota invalida (de 0 a 20)" });
        }
        aloc.nota = Math.round(nota * 100) / 100;
      }

      aloc.classificacao = classificarNota(parseFloat(aloc.nota));
      aloc.observacoes = entrada.observacoes ? String(entrada.observacoes).trim().slice(0, 4000) : null;
      aloc.estado = "Validada";
      aloc.avaliado_por = req.utilizador.id;
      aloc.avaliado_em = new Date();
      await aloc.save();
      avaliadas.push(aloc);
    }

    for (var j = 0; j < avaliadas.length; j++) {
      var avaliada = avaliadas[j];
      await registrarEvento(
        tarefa.id, req.utilizador.id, "avaliada",
        req.utilizador.nome_completo + " avaliou " +
          (avaliada.colaborador ? avaliada.colaborador.nome_completo : "o colaborador") +
          " com nota " + avaliada.nota + " (" + avaliada.classificacao + ")" +
          (avaliada.desempenho !== null && avaliada.desempenho !== undefined
            ? " - desempenho " + avaliada.desempenho + ", produtividade " + avaliada.produtividade +
              ", prazo " + avaliada.cumprimento_prazo : "") +
          (avaliada.observacoes ? " - " + avaliada.observacoes : ""),
        {
          nota: avaliada.nota,
          classificacao: avaliada.classificacao,
          desempenho: avaliada.desempenho,
          produtividade: avaliada.produtividade,
          cumprimento_prazo: avaliada.cumprimento_prazo,
        }
      );
      await notificar(
        req, avaliada.colaborador ? avaliada.colaborador.utilizador_id : null,
        "Tarefa Avaliada",
        "A tarefa '" + tarefa.titulo + "' foi avaliada com nota " + avaliada.nota + " (" + avaliada.classificacao + ")",
        "success"
      );
    }

    if (req.body && req.body.observacoes_gerais !== undefined) {
      await tarefa.update({ validacao_observacoes: req.body.observacoes_gerais || null });
    }

    await derivarTarefa(tarefa.id, req);
    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    decorarResposta(resultado);
    return res.status(200).json({ mensagem: "Avaliacao registada", dados: resultado });
  } catch (e) {
    console.log("Erro ao validar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== REABRIR (gestor, escolhe quem volta a Em Curso) ====================

var reabrir = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem reabrir tarefas" });
    }
    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });
    var tarefa = ctx.tarefa;

    var alocacoes = await TarefaAlocacao.findAll({
      where: { tarefa_id: tarefa.id },
      include: [includeColaborador()],
    });
    var mapa = {};
    alocacoes.forEach(function (a) { mapa[a.id] = a; });

    var alvosIds = Array.isArray(req.body.alocacao_ids) && req.body.alocacao_ids.length > 0
      ? req.body.alocacao_ids
      : alocacoes
          .filter(function (a) { return a.estado === "Validada" || a.estado === "Concluida" || a.estado === "Atrasada"; })
          .map(function (a) { return a.id; });

    if (alvosIds.length === 0) {
      return res.status(400).json({ error: "Nao ha colaboradores para reabrir nesta tarefa" });
    }

    var novoInicio = req.body.janela_inicio !== undefined ? parseDataJanela(req.body.janela_inicio, true) : null;
    if (novoInicio && novoInicio.erro) return res.status(400).json({ error: novoInicio.erro });
    var novoFim = req.body.janela_fim !== undefined ? parseDataJanela(req.body.janela_fim, true) : null;
    if (novoFim && novoFim.erro) return res.status(400).json({ error: novoFim.erro });

    var agora = new Date();
    var reabertas = [];

    for (var i = 0; i < alvosIds.length; i++) {
      var aloc = mapa[alvosIds[i]];
      if (!aloc) return res.status(404).json({ error: "Atribuicao nao encontrada nesta tarefa" });
      if (aloc.estado !== "Validada" && aloc.estado !== "Concluida" && aloc.estado !== "Atrasada") {
        return res.status(400).json({
          error: "Atribuicao de " + (aloc.colaborador ? aloc.colaborador.nome_completo : "colaborador") +
            " nao pode ser reaberta (estado actual: " + aloc.estado + ")",
        });
      }

      var inicio = novoInicio && novoInicio.valor ? new Date(novoInicio.valor) : new Date(aloc.janela_inicio);
      var fim = novoFim && novoFim.valor ? new Date(novoFim.valor) : new Date(aloc.janela_fim);

      if (novoFim && novoFim.valor) {
        // Janela nova indicada pelo gestor: tem de estar no futuro.
        if (fim.getTime() <= agora.getTime()) {
          return res.status(400).json({ error: "O novo fim da janela tem de ser no futuro" });
        }
      } else if (fim.getTime() <= agora.getTime()) {
        // Sem janela nova e a antiga ja terminou: reabre pela mesma duracao,
        // a partir de agora, para nao voltar a concluir de imediato.
        var duracao = Math.max(
          new Date(aloc.janela_fim).getTime() - new Date(aloc.janela_inicio).getTime(),
          60 * 60 * 1000
        );
        inicio = new Date(agora.getTime());
        fim = new Date(agora.getTime() + duracao);
      }

      if (inicio.getTime() >= fim.getTime()) {
        return res.status(400).json({ error: "O fim da janela tem de ser posterior ao inicio" });
      }

      aloc.estado = "Reaberta";
      aloc.janela_inicio = inicio;
      aloc.janela_fim = fim;
      aloc.data_inicio = aloc.data_inicio || inicio;
      aloc.data_conclusao = null;
      aloc.progresso = calcularProgresso(
        { estado: "Reaberta", janela_inicio: inicio, janela_fim: fim, progresso: 0 }, agora
      );
      aloc.nota = null;
      aloc.desempenho = null;
      aloc.produtividade = null;
      aloc.cumprimento_prazo = null;
      aloc.classificacao = null;
      aloc.observacoes = null;
      aloc.avaliado_por = null;
      aloc.avaliado_em = null;
      aloc.justificativa = null;
      aloc.justificativa_decisao = null;
      aloc.justificativa_data = null;
      await aloc.save();
      reabertas.push(aloc);

      await registrarEvento(
        tarefa.id, req.utilizador.id, "reaberta",
        req.utilizador.nome_completo + " reabriu a tarefa para " +
          (aloc.colaborador ? aloc.colaborador.nome_completo : "o colaborador") +
          " - nova janela: " + textoDataCurta(inicio) + " ate " + textoDataCurta(fim)
      );
      await notificar(
        req, aloc.colaborador ? aloc.colaborador.utilizador_id : null,
        "Tarefa Reaberta",
        "A tarefa '" + tarefa.titulo + "' foi reaberta para correccoes (janela ate " + textoDataCurta(fim) + ")",
        "warning"
      );
    }

    await derivarTarefa(tarefa.id, req);
    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    decorarResposta(resultado);
    return res.status(200).json({
      mensagem: reabertas.length > 1 ? reabertas.length + " atribuicoes reabertas" : "Tarefa reaberta",
      dados: resultado,
    });
  } catch (e) {
    console.log("Erro ao reabrir tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== CANCELAR TAREFA (gestor) ====================

var cancelar = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem cancelar tarefas" });
    }
    var ctx = await carregarTarefa(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });
    var tarefa = ctx.tarefa;

    if (tarefa.estado === "Cancelada") {
      return res.status(400).json({ error: "Esta tarefa ja esta cancelada" });
    }

    var alocacoes = await TarefaAlocacao.findAll({ where: { tarefa_id: tarefa.id } });
    for (var i = 0; i < alocacoes.length; i++) {
      var aloc = alocacoes[i];
      if (aloc.estado !== "Cancelada") {
        aloc.progresso = calcularProgresso(aloc, new Date());
        aloc.estado = "Cancelada";
        await aloc.save();
      }
    }

    var motivo = req.body && req.body.motivo ? String(req.body.motivo).trim().slice(0, 1000) : null;
    await registrarEvento(
      tarefa.id, req.utilizador.id, "cancelada",
      req.utilizador.nome_completo + " cancelou a tarefa" + (motivo ? " - " + motivo : "")
    );

    var utilizadoresNotificar = {};
    alocacoes.forEach(function (a) {
      if (a.colaborador_id) utilizadoresNotificar[a.colaborador_id] = true;
    });
    var colaboradores = await Colaborador.findAll({
      where: { id: { [Op.in]: Object.keys(utilizadoresNotificar) }, organizacao_id: req.utilizador.organizacao_id },
    });
    for (var j = 0; j < colaboradores.length; j++) {
      await notificar(
        req, colaboradores[j].utilizador_id, "Tarefa Cancelada",
        "A tarefa '" + tarefa.titulo + "' foi cancelada", "warning"
      );
    }

    await derivarTarefa(tarefa.id, req);
    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes().concat([incluicaoAlocacoes()]) });
    decorarResposta(resultado);
    return res.status(200).json({ mensagem: "Tarefa cancelada", dados: resultado });
  } catch (e) {
    console.log("Erro ao cancelar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== ELIMINAR (gestor) ====================

var remove = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem eliminar tarefas" });
    }

    var tarefa = await Tarefa.findOne({
      where: { id: req.params.id, organizacao_id: req.utilizador.organizacao_id },
    });
    if (!tarefa) return res.status(404).json({ error: "Tarefa nao encontrada" });

    await TarefaEvento.destroy({ where: { tarefa_id: tarefa.id } });
    await TarefaAlocacao.destroy({ where: { tarefa_id: tarefa.id } });
    await tarefa.destroy();

    return res.status(200).json({ mensagem: "Tarefa eliminada com sucesso" });
  } catch (e) {
    console.log("Erro ao eliminar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = {
  list,
  estatisticas,
  getById,
  create,
  update,
  adicionarAlocacoes,
  editarAlocacao,
  removerAlocacao,
  iniciar,
  iniciarAlocacao,
  justificarAlocacao,
  decidirJustificativa,
  terminar,
  progresso,
  validar,
  reabrir,
  cancelar,
  remove,
  ehGestorTarefas,
};
