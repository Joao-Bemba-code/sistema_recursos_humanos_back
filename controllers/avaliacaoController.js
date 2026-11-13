var { Op } = require("sequelize");
var { CicloAvaliacao, AvaliacaoDesempenho, Colaborador, Utilizador, TarefaAlocacao } = require("../models");
var notificacaoController = require("./notificacaoController");

// ==================== CICLOS ====================

var listCiclos = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;

    var where = {};
    if (search) {
      where[Op.or] = [
        { nome: { [Op.like]: "%" + search + "%" } },
        { descricao: { [Op.like]: "%" + search + "%" } },
      ];
    }
    if (estado) where.estado = estado;

    var { count, rows } = await CicloAvaliacao.findAndCountAll({
      where: where,
      order: [["data_inicio", "DESC"]],
      limit: limit,
      offset: offset,
    });

    return res.status(200).json({
      dados: rows,
      paginacao: {
        total: count,
        pagina: page,
        limite: limit,
        total_paginas: Math.ceil(count / limit),
      },
    });
  } catch (e) {
    console.log("Erro ao listar ciclos de avaliacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getCiclo = async function (req, res) {
  try {
    var ciclo = await CicloAvaliacao.findByPk(req.params.id, {
      include: [
        { model: AvaliacaoDesempenho, as: "avaliacoes", include: [
          { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
        ] },
      ],
    });

    if (!ciclo) {
      return res.status(404).json({ error: "Ciclo de avaliacao nao encontrado" });
    }

    return res.status(200).json({ dados: ciclo });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var createCiclo = async function (req, res) {
  try {
    var dados = req.body;

    if (!dados.nome || !dados.data_inicio || !dados.data_fim) {
      return res.status(400).json({ error: "nome, data_inicio e data_fim sao obrigatorios" });
    }

    var ciclo = await CicloAvaliacao.create(dados);

    return res.status(201).json({
      mensagem: "Ciclo de avaliacao criado com sucesso",
      dados: ciclo,
    });
  } catch (e) {
    console.log("Erro ao criar ciclo de avaliacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var updateCiclo = async function (req, res) {
  try {
    var ciclo = await CicloAvaliacao.findByPk(req.params.id);
    if (!ciclo) {
      return res.status(404).json({ error: "Ciclo de avaliacao nao encontrado" });
    }

    var camposProtegidos = ["id", "createdAt", "updatedAt"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    await ciclo.update(dadosActualizar);

    return res.status(200).json({
      mensagem: "Ciclo de avaliacao actualizado com sucesso",
      dados: ciclo,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var removeCiclo = async function (req, res) {
  try {
    var ciclo = await CicloAvaliacao.findByPk(req.params.id);
    if (!ciclo) {
      return res.status(404).json({ error: "Ciclo de avaliacao nao encontrado" });
    }

    var temAvaliacoes = await AvaliacaoDesempenho.count({ where: { ciclo_id: req.params.id } });
    if (temAvaliacoes > 0) {
      return res.status(400).json({ error: "Nao e possivel eliminar ciclo com avaliacoes associadas" });
    }

    await ciclo.destroy();

    return res.status(200).json({ mensagem: "Ciclo de avaliacao eliminado com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== AVALIACOES ====================

var calcularClassificacao = function (notaFinal) {
  if (notaFinal >= 18) return "Excelente";
  if (notaFinal >= 15) return "Bom";
  if (notaFinal >= 10) return "Suficiente";
  if (notaFinal >= 5) return "Insuficiente";
  return "Mau";
};

// ==================== NOTAS AUTOMATICAS (a partir das tarefas) ====================

// As notas da avaliacao sao automaticas, calculadas a partir das tarefas
// validadas do colaborador dentro do periodo do ciclo:
//   - nota tecnica        = media das notas automaticas das tarefas validadas
//   - nota comportamental = pontualidade (20 x tarefas dentro do prazo / total)
//   - nota final          = media das duas
// O administrador apenas comenta e valida; nao escreve notas.
var calcularAutoNotas = async function (colaboradorId, ciclo, organizacaoId) {
  var inicio = new Date(ciclo.data_inicio + "T00:00:00");
  var fim = new Date(ciclo.data_fim + "T23:59:59");

  var alocacoes = await TarefaAlocacao.findAll({
    where: {
      organizacao_id: organizacaoId,
      colaborador_id: colaboradorId,
      estado: "Validada",
      janela_fim: { [Op.between]: [inicio, fim] },
    },
    order: [["janela_fim", "ASC"]],
  });

  var total = alocacoes.length;
  var dentroPrazo = 0;
  var soma = 0;
  var comNota = 0;

  alocacoes.forEach(function (a) {
    var nota = a.nota !== null && a.nota !== undefined ? parseFloat(a.nota) : null;
    if (nota !== null && !isNaN(nota)) {
      soma += nota;
      comNota++;
      // Nota >= 12 significa que terminou dentro da janela (12/16/20);
      // nota 5 e entregue no/fora do prazo.
      if (nota >= 12) dentroPrazo++;
    }
  });

  var calculo = {
    total_tarefas: total,
    dentro_prazo: dentroPrazo,
    nota_tecnica: null,
    nota_comportamental: null,
    nota_final: null,
    classificacao: null,
  };

  if (comNota > 0) {
    calculo.nota_tecnica = Math.round((soma / comNota) * 100) / 100;
  }
  if (total > 0) {
    calculo.nota_comportamental = Math.round((20 * dentroPrazo / total) * 100) / 100;
  }
  if (calculo.nota_tecnica !== null && calculo.nota_comportamental !== null) {
    calculo.nota_final = Math.round(((calculo.nota_tecnica + calculo.nota_comportamental) / 2) * 100) / 100;
    calculo.classificacao = calcularClassificacao(calculo.nota_final);
  }

  return calculo;
};

// Devolve as notas automaticas de um colaborador num ciclo (o ecra de
// avaliacao mostra este painel ao administrador antes de guardar).
var autoCalculo = async function (req, res) {
  try {
    var colaboradorId = req.query.colaborador_id;
    var cicloId = req.query.ciclo_id;
    if (!colaboradorId) {
      return res.status(400).json({ error: "colaborador_id e obrigatorio" });
    }
    if (!cicloId) {
      return res.status(400).json({ error: "ciclo_id e obrigatorio" });
    }

    var ciclo = await CicloAvaliacao.findByPk(cicloId);
    if (!ciclo) {
      return res.status(404).json({ error: "Ciclo de avaliacao nao encontrado" });
    }

    var colaborador = await Colaborador.findOne({
      where: { id: colaboradorId, organizacao_id: req.utilizador.organizacao_id },
    });
    if (!colaborador) {
      return res.status(404).json({ error: "Colaborador nao encontrado" });
    }

    var calculo = await calcularAutoNotas(colaboradorId, ciclo, req.utilizador.organizacao_id);
    return res.status(200).json({ dados: calculo });
  } catch (e) {
    console.log("Erro no calculo automatico da avaliacao:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var listAvaliacoes = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var ciclo_id = req.query.ciclo_id;
    var colaborador_id = req.query.colaborador_id;
    var classificacao = req.query.classificacao;

    var where = {};
    if (estado) where.estado = estado;
    if (ciclo_id) where.ciclo_id = ciclo_id;
    if (colaborador_id) where.colaborador_id = colaborador_id;
    if (classificacao) where.classificacao = classificacao;

    var include = [
      { model: CicloAvaliacao, as: "ciclo", attributes: ["id", "nome", "data_inicio", "data_fim"] },
      { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
    ];

    if (search) {
      include[0].where = { nome: { [Op.like]: "%" + search + "%" } };
    }

    var { count, rows } = await AvaliacaoDesempenho.findAndCountAll({
      where: where,
      include: include,
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

    return res.status(200).json({
      dados: rows,
      paginacao: {
        total: count,
        pagina: page,
        limite: limit,
        total_paginas: Math.ceil(count / limit),
      },
    });
  } catch (e) {
    console.log("Erro ao listar avaliacoes de desempenho:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var createAvaliacao = async function (req, res) {
  try {
    var dados = req.body;

    dados.colaborador_id = dados.colaborador_id;
    dados.ciclo_id = dados.ciclo_id;
    if (!dados.colaborador_id) {
      return res.status(400).json({ error: "colaborador_id e obrigatorio" });
    }
    if (!dados.ciclo_id) {
      return res.status(400).json({ error: "ciclo_id e obrigatorio" });
    }

    var ciclo = await CicloAvaliacao.findByPk(dados.ciclo_id);
    if (!ciclo) {
      return res.status(400).json({ error: "Ciclo de avaliacao nao encontrado" });
    }

    var colaboradorExiste = await Colaborador.findOne({
      where: { id: dados.colaborador_id, organizacao_id: req.utilizador.organizacao_id },
    });
    if (!colaboradorExiste) {
      return res.status(404).json({ error: "Colaborador nao encontrado" });
    }

    // As notas sao automaticas, a partir das tarefas validadas no periodo do
    // ciclo. O que vier do cliente e ignorado.
    var calculo = await calcularAutoNotas(dados.colaborador_id, ciclo, req.utilizador.organizacao_id);
    dados.nota_tecnica = calculo.nota_tecnica;
    dados.nota_comportamental = calculo.nota_comportamental;
    dados.nota_final = calculo.nota_final;
    dados.classificacao = calculo.classificacao;

    var avaliacao = await AvaliacaoDesempenho.create(dados);

    try {
      var colab = await Colaborador.findByPk(dados.colaborador_id, { attributes: ["id", "nome_completo", "utilizador_id"] });
      if (colab && colab.utilizador_id) {
        var ciclo = await CicloAvaliacao.findByPk(dados.ciclo_id, { attributes: ["nome"] });
        await notificacaoController.create({
          organizacao_id: req.utilizador.organizacao_id,
          utilizador_id: colab.utilizador_id,
          titulo: "Nova Avaliacao",
          mensagem: "Foi registada uma avaliacao de desempenho para o ciclo '" + (ciclo ? ciclo.nome : "—") + "'.",
          tipo: "info",
          lida: false,
          link: "/dashboard/portal",
          modulo: "avaliacao",
        });
      }
    } catch (notifErr) {
      console.log("Aviso: nao foi possivel criar notificacao para colaborador:", notifErr.message);
    }

    return res.status(201).json({
      mensagem: "Avaliacao de desempenho criada com sucesso",
      dados: avaliacao,
    });
  } catch (e) {
    console.log("Erro ao criar avaliacao de desempenho:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var updateAvaliacao = async function (req, res) {
  try {
    var avaliacao = await AvaliacaoDesempenho.findByPk(req.params.id);
    if (!avaliacao) {
      return res.status(404).json({ error: "Avaliacao de desempenho nao encontrada" });
    }

    var camposProtegidos = ["id", "colaborador_id", "ciclo_id", "createdAt", "updatedAt", "nota_tecnica", "nota_comportamental", "nota_final", "classificacao"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    // As notas sao automaticas: recalculadas a partir das tarefas validadas
    // no periodo do ciclo. O cliente nao as pode alterar.
    var ciclo = await CicloAvaliacao.findByPk(avaliacao.ciclo_id);
    if (ciclo) {
      var calculo = await calcularAutoNotas(avaliacao.colaborador_id, ciclo, req.utilizador.organizacao_id);
      dadosActualizar.nota_tecnica = calculo.nota_tecnica;
      dadosActualizar.nota_comportamental = calculo.nota_comportamental;
      dadosActualizar.nota_final = calculo.nota_final;
      dadosActualizar.classificacao = calculo.classificacao;
    }

    await avaliacao.update(dadosActualizar);

    try {
      var colabUpdate = await Colaborador.findByPk(avaliacao.colaborador_id, { attributes: ["id", "nome_completo", "utilizador_id"] });
      if (colabUpdate && colabUpdate.utilizador_id) {
        var cicloUpdate = await CicloAvaliacao.findByPk(avaliacao.ciclo_id, { attributes: ["nome"] });
        var novoEstado = dadosActualizar.estado || avaliacao.estado;
        var msgNotif = "A sua avaliacao no ciclo '" + (cicloUpdate ? cicloUpdate.nome : "—") + "' foi actualizada.";
        if (novoEstado === "Validada") msgNotif = "A sua avaliacao no ciclo '" + (cicloUpdate ? cicloUpdate.nome : "—") + "' foi validada. Nota final: " + (dadosActualizar.nota_final || avaliacao.nota_final || "—");
        await notificacaoController.create({
          organizacao_id: req.utilizador.organizacao_id,
          utilizador_id: colabUpdate.utilizador_id,
          titulo: "Avaliacao Actualizada",
          mensagem: msgNotif,
          tipo: novoEstado === "Validada" ? "success" : "info",
          lida: false,
          link: "/dashboard/portal",
          modulo: "avaliacao",
        });
      }
    } catch (notifErr) {
      console.log("Aviso: nao foi possivel criar notificacao para colaborador:", notifErr.message);
    }

    var actualizado = await AvaliacaoDesempenho.findByPk(req.params.id, {
      include: [
        { model: CicloAvaliacao, as: "ciclo", attributes: ["id", "nome"] },
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Avaliacao de desempenho actualizada com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { listCiclos, getCiclo, createCiclo, updateCiclo, removeCiclo, listAvaliacoes, createAvaliacao, updateAvaliacao, autoCalculo };
