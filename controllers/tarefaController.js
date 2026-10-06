var { Op } = require("sequelize");
var {
  Tarefa,
  TarefaEvento,
  Colaborador,
  Utilizador,
} = require("../models");
var notificacaoController = require("./notificacaoController");
var { perfisUtilizador, fundirPermissoes } = require("../protect/rbac");

var ESTADOS = ["Pendente", "Em_curso", "Concluida", "Validada", "Cancelada"];
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

function normalizarHora(valor) {
  if (!valor || !HORA_VALIDA.test(String(valor))) return null;
  return String(valor).slice(0, 5);
}

function textoPrazo(tarefa) {
  if (!tarefa || !tarefa.prazo) return "";
  var base = String(tarefa.prazo).slice(0, 10);
  return tarefa.prazo_hora ? base + " as " + String(tarefa.prazo_hora).slice(0, 5) : base;
}

// Momento exato do prazo: data + hora (sem hora vale o fim do dia).
function prazoLimite(prazo, prazoHora) {
  if (!prazo) return null;
  var partes = String(prazo).slice(0, 10).split("-");
  if (partes.length !== 3) return null;
  var hora = prazoHora ? String(prazoHora).slice(0, 5) : "23:59";
  var hp = hora.split(":");
  return new Date(
    Number(partes[0]),
    Number(partes[1]) - 1,
    Number(partes[2]),
    Number(hp[0]) || 0,
    Number(hp[1]) || 0,
    0,
    0
  );
}

// Atraso face ao prazo: minutos exactos (para a nota) e dias arredondados
// por cima (para mostrar). Sem prazo nao ha atraso.
function calcularAtraso(prazo, quando, prazoHora) {
  var limite = prazoLimite(prazo, prazoHora);
  if (!limite) return { dias: 0, minutos: 0 };
  var c = quando || new Date();
  var diff = c.getTime() - limite.getTime();
  if (diff <= 0) return { dias: 0, minutos: 0 };
  var minutos = Math.ceil(diff / 60000);
  return { dias: Math.ceil(minutos / 1440), minutos: minutos };
}

// Avaliacao AUTOMATICA: 60% progressao + 40% cumprimento do prazo.
// progresso 100% no prazo -> 20 valores; cada dia de atraso desce 2 valores
// na componente do prazo (nunca abaixo de 0). Com prazo por hora o atraso
// e fraccionario (1 hora de atraso custa ~0,08 valores).
function calcularNota(progresso, atrasoDias, atrasoMinutos) {
  var notaProgresso = (Math.max(0, Math.min(100, progresso)) / 100) * 20;
  var atrasoDiasFraccionario = atrasoMinutos > 0 ? atrasoMinutos / 1440 : (atrasoDias || 0);
  var notaPrazo = atrasoDiasFraccionario > 0 ? Math.max(0, 20 - atrasoDiasFraccionario * 2) : 20;
  var nota = 0.6 * notaProgresso + 0.4 * notaPrazo;
  return Math.max(0, Math.min(20, Math.round(nota * 100) / 100));
}

function classificarNota(nota) {
  if (nota >= 18) return "Excelente";
  if (nota >= 15) return "Bom";
  if (nota >= 10) return "Suficiente";
  if (nota >= 5) return "Insuficiente";
  return "Mau";
}

function detalhesNota(progresso, atrasoDias, atrasoMinutos) {
  var partes = [];
  partes.push("Progressao: " + progresso + "%");
  if (atrasoMinutos > 0) {
    if (atrasoMinutos < 60) {
      partes.push("Entregue " + atrasoMinutos + " min apos o prazo");
    } else if (atrasoMinutos < 1440) {
      partes.push("Entregue " + (Math.round((atrasoMinutos / 60) * 10) / 10) + " h apos o prazo");
    } else {
      partes.push("Entregue com " + atrasoDias + " dia(s) de atraso");
    }
  } else {
    partes.push("Entregue no prazo");
  }
  return partes.join(" | ");
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

function incluicoes() {
  return [
    {
      model: Colaborador,
      as: "colaborador",
      attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id", "fotografia"],
    },
    {
      model: Utilizador,
      as: "atribuidor",
      attributes: ["id", "nome_completo"],
    },
  ];
}

// ==================== LISTAGEM ====================

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page || req.query.pagina, 10) || 1;
    var limit = parseInt(req.query.limit || req.query.limite, 10) || 15;
    if (limit < 1) limit = 15;
    if (limit > 100) limit = 100;
    var offset = (page - 1) * limit;

    var gestor = ehGestorTarefas(req.utilizador);
    var where = { organizacao_id: req.utilizador.organizacao_id };

    if (!gestor) {
      var colab = await meuColaborador(req);
      if (!colab) {
        return res.status(200).json({
          dados: [],
          paginacao: { total: 0, pagina: page, limite: limit, total_paginas: 0 },
        });
      }
      where.colaborador_id = colab.id;
    } else if (req.query.colaborador_id) {
      where.colaborador_id = req.query.colaborador_id;
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
    if (req.query.atrasadas === "true" || req.query.atrasadas === "1") {
      // Atrasada = prazo (data + hora, se definida) ja passou e ainda nao
      // esta concluida/validada/cancelada.
      var agora = new Date();
      var hoje = agora.toISOString().slice(0, 10);
      var horaAgora = agora.toTimeString().slice(0, 5);
      condicoes.push({
        [Op.or]: [
          { prazo: { [Op.lt]: hoje } },
          { prazo: hoje, prazo_hora: { [Op.lte]: horaAgora } },
        ],
      });
      where.estado = { [Op.in]: ["Pendente", "Em_curso"] };
    }
    if (condicoes.length > 0) where[Op.and] = condicoes;

    var resultado = await Tarefa.findAndCountAll({
      where: where,
      include: incluicoes(),
      order: [["prazo", "ASC"], ["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

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
    var where = { organizacao_id: req.utilizador.organizacao_id };

    if (!gestor) {
      var colab = await meuColaborador(req);
      if (!colab) {
        return res.status(200).json({
          dados: { total: 0, por_estado: {}, atrasadas: 0, nota_media: null, progresso_medio: 0 },
        });
      }
      where.colaborador_id = colab.id;
    }

    var tarefas = await Tarefa.findAll({
      where: where,
      attributes: ["estado", "prazo", "prazo_hora", "nota", "progresso", "atraso_dias", "prioridade"],
    });

    var porEstado = {};
    ESTADOS.forEach(function (e) { porEstado[e] = 0; });
    var atrasadas = 0;
    var somaNotas = 0;
    var totalNotas = 0;
    var somaProgresso = 0;

    tarefas.forEach(function (t) {
      porEstado[t.estado] = (porEstado[t.estado] || 0) + 1;
      somaProgresso += t.progresso || 0;
      if (t.nota !== null && t.nota !== undefined) {
        somaNotas += parseFloat(t.nota);
        totalNotas++;
      }
      var limite = prazoLimite(t.prazo, t.prazo_hora);
      if (limite && limite.getTime() < Date.now() && (t.estado === "Pendente" || t.estado === "Em_curso")) {
        atrasadas++;
      }
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
    var tarefa = await Tarefa.findOne({
      where: { id: req.params.id, organizacao_id: req.utilizador.organizacao_id },
      include: incluicoes().concat([
        {
          model: TarefaEvento,
          as: "eventos",
          include: [{ model: Utilizador, as: "utilizador", attributes: ["id", "nome_completo"] }],
          order: [["createdAt", "DESC"]],
        },
      ]),
    });

    if (!tarefa) {
      return res.status(404).json({ error: "Tarefa nao encontrada" });
    }

    var gestor = ehGestorTarefas(req.utilizador);
    if (!gestor) {
      var colab = await meuColaborador(req);
      if (!colab || String(colab.id) !== String(tarefa.colaborador_id)) {
        return res.status(403).json({ error: "Sem permissao para ver esta tarefa" });
      }
    }

    return res.status(200).json({ dados: tarefa });
  } catch (e) {
    console.log("Erro ao obter tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== CRIAR ====================

var create = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem atribuir tarefas" });
    }

    var dados = req.body;
    if (!dados.titulo || !String(dados.titulo).trim()) {
      return res.status(400).json({ error: "O titulo da tarefa e obrigatorio" });
    }
    if (!dados.colaborador_id) {
      return res.status(400).json({ error: "O colaborador e obrigatorio" });
    }
    if (dados.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(String(dados.prazo))) {
      return res.status(400).json({ error: "Prazo invalido (use AAAA-MM-DD)" });
    }
    if (dados.prazo_hora && !HORA_VALIDA.test(String(dados.prazo_hora))) {
      return res.status(400).json({ error: "Hora do prazo invalida (use HH:MM)" });
    }
    if (dados.prioridade && PRIORIDADES.indexOf(dados.prioridade) === -1) {
      return res.status(400).json({ error: "Prioridade invalida" });
    }

    var colab = await Colaborador.findOne({
      where: { id: dados.colaborador_id, organizacao_id: req.utilizador.organizacao_id },
    });
    if (!colab) {
      return res.status(404).json({ error: "Colaborador nao encontrado" });
    }

    var tarefa = await Tarefa.create({
      organizacao_id: req.utilizador.organizacao_id,
      colaborador_id: colab.id,
      atribuido_por: req.utilizador.id,
      titulo: String(dados.titulo).trim().slice(0, 200),
      descricao: dados.descricao || null,
      prazo: dados.prazo || null,
      prazo_hora: normalizarHora(dados.prazo_hora),
      prioridade: dados.prioridade || "Media",
      estado: "Pendente",
      progresso: 0,
    });

    await registrarEvento(
      tarefa.id,
      req.utilizador.id,
      "criada",
      req.utilizador.nome_completo + " atribuiu a tarefa a " + colab.nome_completo,
      { prazo: tarefa.prazo, prazo_hora: tarefa.prazo_hora, prioridade: tarefa.prioridade }
    );

    await notificar(
      req,
      colab.utilizador_id,
      "Nova Tarefa",
      "Foi-lhe atribuida a tarefa: " + tarefa.titulo + (tarefa.prazo ? " (prazo: " + textoPrazo(tarefa) + ")" : ""),
      "info"
    );

    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes() });
    return res.status(201).json({ mensagem: "Tarefa atribuida com sucesso", dados: resultado });
  } catch (e) {
    console.log("Erro ao criar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== EDITAR (gestor) ====================

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
    if (tarefa.estado === "Validada" || tarefa.estado === "Cancelada") {
      return res.status(400).json({ error: "Tarefas validadas ou canceladas nao podem ser editadas" });
    }

    var dados = req.body;
    var alteracoes = {};

    if (dados.titulo !== undefined && String(dados.titulo).trim()) {
      alteracoes.titulo = String(dados.titulo).trim().slice(0, 200);
    }
    if (dados.descricao !== undefined) alteracoes.descricao = dados.descricao || null;
    if (dados.prazo !== undefined) {
      if (dados.prazo && !/^\d{4}-\d{2}-\d{2}$/.test(String(dados.prazo))) {
        return res.status(400).json({ error: "Prazo invalido (use AAAA-MM-DD)" });
      }
      alteracoes.prazo = dados.prazo || null;
    }
    if (dados.prazo_hora !== undefined) {
      if (dados.prazo_hora && !HORA_VALIDA.test(String(dados.prazo_hora))) {
        return res.status(400).json({ error: "Hora do prazo invalida (use HH:MM)" });
      }
      alteracoes.prazo_hora = normalizarHora(dados.prazo_hora);
    }
    if (dados.prioridade !== undefined) {
      if (PRIORIDADES.indexOf(dados.prioridade) === -1) {
        return res.status(400).json({ error: "Prioridade invalida" });
      }
      alteracoes.prioridade = dados.prioridade;
    }

    if (dados.colaborador_id && String(dados.colaborador_id) !== String(tarefa.colaborador_id)) {
      var novoColab = await Colaborador.findOne({
        where: { id: dados.colaborador_id, organizacao_id: req.utilizador.organizacao_id },
      });
      if (!novoColab) return res.status(404).json({ error: "Colaborador nao encontrado" });
      alteracoes.colaborador_id = novoColab.id;
      await notificar(req, novoColab.utilizador_id, "Nova Tarefa", "Foi-lhe atribuida a tarefa: " + tarefa.titulo, "info");
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

    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes() });
    return res.status(200).json({ mensagem: "Tarefa actualizada com sucesso", dados: resultado });
  } catch (e) {
    console.log("Erro ao editar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== PARTILHADO: acesso do executante ====================

async function carregarTarefaExecucao(req) {
  var tarefa = await Tarefa.findOne({
    where: { id: req.params.id, organizacao_id: req.utilizador.organizacao_id },
    include: incluicoes(),
  });
  if (!tarefa) return { erro: { status: 404, mensagem: "Tarefa nao encontrada" } };

  var gestor = ehGestorTarefas(req.utilizador);
  if (!gestor) {
    var colab = await meuColaborador(req);
    if (!colab || String(colab.id) !== String(tarefa.colaborador_id)) {
      return { erro: { status: 403, mensagem: "Apenas o colaborador atribuido pode actualizar esta tarefa" } };
    }
  }
  return { tarefa: tarefa, gestor: gestor };
}

// ==================== INICIAR ====================

var iniciar = async function (req, res) {
  try {
    var ctx = await carregarTarefaExecucao(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });

    var tarefa = ctx.tarefa;
    if (tarefa.estado !== "Pendente") {
      return res.status(400).json({ error: "Apenas tarefas pendentes podem ser iniciadas" });
    }

    await tarefa.update({ estado: "Em_curso", data_inicio: new Date() });
    await registrarEvento(tarefa.id, req.utilizador.id, "iniciada", req.utilizador.nome_completo + " iniciou a tarefa");

    return res.status(200).json({ mensagem: "Tarefa iniciada", dados: tarefa });
  } catch (e) {
    console.log("Erro ao iniciar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== PROGRESSO (avaliacao automatica no fim) ====================

var progresso = async function (req, res) {
  try {
    var ctx = await carregarTarefaExecucao(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });

    var tarefa = ctx.tarefa;
    if (tarefa.estado === "Concluida" || tarefa.estado === "Validada" || tarefa.estado === "Cancelada") {
      return res.status(400).json({ error: "Esta tarefa ja nao aceita actualizacoes de progresso" });
    }

    var valor = parseInt(req.body.progresso, 10);
    if (isNaN(valor) || valor < 0 || valor > 100) {
      return res.status(400).json({ error: "Progresso invalido (0 a 100)" });
    }

    var atualizacao = { progresso: valor };
    var progressoAnterior = tarefa.progresso;

    if (valor > 0 && tarefa.estado === "Pendente") {
      atualizacao.estado = "Em_curso";
      atualizacao.data_inicio = tarefa.data_inicio || new Date();
    }

    if (valor === 100) {
      var quando = new Date();
      var atraso = calcularAtraso(tarefa.prazo, quando, tarefa.prazo_hora);
      var nota = calcularNota(100, atraso.dias, atraso.minutos);
      atualizacao.estado = "Concluida";
      atualizacao.data_conclusao = quando;
      atualizacao.atraso_dias = atraso.dias;
      atualizacao.atraso_minutos = atraso.minutos;
      atualizacao.nota = nota;
      atualizacao.classificacao = classificarNota(nota);
      atualizacao.avaliacao_detalhes = detalhesNota(100, atraso.dias, atraso.minutos);
      if (req.body.observacoes !== undefined) {
        atualizacao.observacoes_conclusao = req.body.observacoes || null;
      }
    }

    await tarefa.update(atualizacao);

    if (valor === 100) {
      await registrarEvento(
        tarefa.id,
        req.utilizador.id,
        "concluida",
        req.utilizador.nome_completo + " concluiu a tarefa com nota " + tarefa.nota + " (" + tarefa.classificacao + ")",
        { nota: tarefa.nota, classificacao: tarefa.classificacao, atraso_dias: tarefa.atraso_dias, atraso_minutos: tarefa.atraso_minutos }
      );
      if (String(tarefa.atribuido_por) !== String(req.utilizador.id)) {
        await notificar(req, tarefa.atribuido_por, "Tarefa Concluida", tarefa.titulo + " foi concluida com nota " + tarefa.nota, "success");
      }
    } else {
      await registrarEvento(
        tarefa.id,
        req.utilizador.id,
        "progresso",
        "Progresso actualizado de " + progressoAnterior + "% para " + valor + "%",
        { de: progressoAnterior, para: valor }
      );
    }

    var resultado = await Tarefa.findByPk(tarefa.id, { include: incluicoes() });
    return res.status(200).json({
      mensagem: valor === 100 ? "Tarefa concluida - avaliacao automatica gerada" : "Progresso actualizado",
      dados: resultado,
    });
  } catch (e) {
    console.log("Erro ao actualizar progresso:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== VALIDAR / REABRIR (gestor) ====================

var validar = async function (req, res) {
  try {
    if (!ehGestorTarefas(req.utilizador)) {
      return res.status(403).json({ error: "Apenas gestores podem validar tarefas" });
    }

    var tarefa = await Tarefa.findOne({
      where: { id: req.params.id, organizacao_id: req.utilizador.organizacao_id },
      include: incluicoes(),
    });
    if (!tarefa) return res.status(404).json({ error: "Tarefa nao encontrada" });

    var acao = req.body.acao;
    if (acao !== "validar" && acao !== "reabrir") {
      return res.status(400).json({ error: "Acao invalida (validar ou reabrir)" });
    }

    var colabUtilizador = tarefa.colaborador ? tarefa.colaborador.utilizador_id : null;

    if (acao === "validar") {
      if (tarefa.estado !== "Concluida") {
        return res.status(400).json({ error: "Apenas tarefas concluidas podem ser validadas" });
      }
      await tarefa.update({
        estado: "Validada",
        validacao_observacoes: req.body.observacoes || null,
      });
      await registrarEvento(
        tarefa.id,
        req.utilizador.id,
        "validada",
        req.utilizador.nome_completo + " validou a tarefa (nota " + tarefa.nota + ")"
      );
      await notificar(req, colabUtilizador, "Tarefa Validada", "A tarefa '" + tarefa.titulo + "' foi validada com nota " + tarefa.nota, "success");
      var resultado1 = await Tarefa.findByPk(tarefa.id, { include: incluicoes() });
      return res.status(200).json({ mensagem: "Tarefa validada", dados: resultado1 });
    }

    if (tarefa.estado !== "Concluida" && tarefa.estado !== "Validada") {
      return res.status(400).json({ error: "Apenas tarefas concluidas podem ser reabertas" });
    }

    await tarefa.update({
      estado: "Em_curso",
      data_conclusao: null,
      atraso_dias: 0,
      atraso_minutos: 0,
      nota: null,
      classificacao: null,
      avaliacao_detalhes: null,
      validacao_observacoes: req.body.observacoes || null,
    });
    await registrarEvento(
      tarefa.id,
      req.utilizador.id,
      "reaberta",
      req.utilizador.nome_completo + " reabriu a tarefa para revisao"
    );
    await notificar(req, colabUtilizador, "Tarefa Reaberta", "A tarefa '" + tarefa.titulo + "' foi reaberta para revisao", "warning");

    var resultado2 = await Tarefa.findByPk(tarefa.id, { include: incluicoes() });
    return res.status(200).json({ mensagem: "Tarefa reaberta", dados: resultado2 });
  } catch (e) {
    console.log("Erro ao validar tarefa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== CANCELAR ====================

var cancelar = async function (req, res) {
  try {
    var ctx = await carregarTarefaExecucao(req);
    if (ctx.erro) return res.status(ctx.erro.status).json({ error: ctx.erro.mensagem });

    var tarefa = ctx.tarefa;
    if (tarefa.estado === "Validada" || tarefa.estado === "Cancelada") {
      return res.status(400).json({ error: "Esta tarefa ja nao pode ser cancelada" });
    }

    await tarefa.update({ estado: "Cancelada" });
    await registrarEvento(tarefa.id, req.utilizador.id, "cancelada", req.utilizador.nome_completo + " cancelou a tarefa");

    if (ctx.gestor) {
      await notificar(req, tarefa.colaborador ? tarefa.colaborador.utilizador_id : null, "Tarefa Cancelada", "A tarefa '" + tarefa.titulo + "' foi cancelada", "warning");
    } else {
      await notificar(req, tarefa.atribuido_por, "Tarefa Cancelada", tarefa.titulo + " foi cancelada pelo colaborador", "warning");
    }

    return res.status(200).json({ mensagem: "Tarefa cancelada", dados: tarefa });
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
  iniciar,
  progresso,
  validar,
  cancelar,
  remove,
  ehGestorTarefas,
};
