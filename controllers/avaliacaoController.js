var { Op } = require("sequelize");
var { CicloAvaliacao, AvaliacaoDesempenho, Colaborador, Utilizador, Notificacao } = require("../models");

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

var listAvaliacoes = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var ciclo_id = req.query.ciclo_id;
    var colaborador_id = req.query.colaborador_id;

    var where = {};
    if (estado) where.estado = estado;
    if (ciclo_id) where.ciclo_id = ciclo_id;
    if (colaborador_id) where.colaborador_id = colaborador_id;

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

    if (dados.nota_tecnica !== undefined && dados.nota_comportamental !== undefined) {
      dados.nota_final = (parseFloat(dados.nota_tecnica) + parseFloat(dados.nota_comportamental)) / 2;
      dados.classificacao = calcularClassificacao(dados.nota_final);
    }

    var avaliacao = await AvaliacaoDesempenho.create(dados);

    try {
      var colab = await Colaborador.findByPk(dados.colaborador_id, { attributes: ["id", "nome_completo", "utilizador_id"] });
      if (colab && colab.utilizador_id) {
        var ciclo = await CicloAvaliacao.findByPk(dados.ciclo_id, { attributes: ["nome"] });
        await Notificacao.create({
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

    var camposProtegidos = ["id", "colaborador_id", "ciclo_id", "createdAt", "updatedAt"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    var notaTecnica = dadosActualizar.nota_tecnica !== undefined ? parseFloat(dadosActualizar.nota_tecnica) : (avaliacao.nota_tecnica ? parseFloat(avaliacao.nota_tecnica) : null);
    var notaComportamental = dadosActualizar.nota_comportamental !== undefined ? parseFloat(dadosActualizar.nota_comportamental) : (avaliacao.nota_comportamental ? parseFloat(avaliacao.nota_comportamental) : null);

    if (notaTecnica !== null && notaComportamental !== null) {
      dadosActualizar.nota_final = Math.round(((notaTecnica + notaComportamental) / 2) * 100) / 100;
      dadosActualizar.classificacao = calcularClassificacao(dadosActualizar.nota_final);
    }

    await avaliacao.update(dadosActualizar);

    try {
      var colabUpdate = await Colaborador.findByPk(avaliacao.colaborador_id, { attributes: ["id", "nome_completo", "utilizador_id"] });
      if (colabUpdate && colabUpdate.utilizador_id) {
        var cicloUpdate = await CicloAvaliacao.findByPk(avaliacao.ciclo_id, { attributes: ["nome"] });
        var novoEstado = dadosActualizar.estado || avaliacao.estado;
        var msgNotif = "A sua avaliacao no ciclo '" + (cicloUpdate ? cicloUpdate.nome : "—") + "' foi actualizada.";
        if (novoEstado === "Validada") msgNotif = "A sua avaliacao no ciclo '" + (cicloUpdate ? cicloUpdate.nome : "—") + "' foi validada. Nota final: " + (dadosActualizar.nota_final || avaliacao.nota_final || "—");
        await Notificacao.create({
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

module.exports = { listCiclos, getCiclo, createCiclo, updateCiclo, removeCiclo, listAvaliacoes, createAvaliacao, updateAvaliacao };
