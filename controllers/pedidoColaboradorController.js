var { Op } = require("sequelize");
var { PedidoColaborador, Colaborador, Utilizador, Perfil, Notificacao, RegistoPresenca, Credito } = require("../models");
var notificacaoController = require("./notificacaoController");
var { justificarDispensa } = require("../helpers/bancoHoras");
var { avaliarElegibilidadeCredito } = require("../helpers/elegibilidadeCredito");
var { guardarFicheiro, urlDoFicheiro, apagarFicheiroDeUrl, responderComFicheiro } = require("../helpers/ficheiros");
var { obterIdsResponsaveis } = require("../helpers/responsaveisPedido");

var dadosDoPedido = function (pedido) {
  if (!pedido || !pedido.dados) return {};
  if (typeof pedido.dados === "string") {
    try { return JSON.parse(pedido.dados); } catch (e) { return {}; }
  }
  return pedido.dados;
};

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var estado = req.query.estado;
    var tipo = req.query.tipo;
    var search = req.query.search || "";

    var where = {
      organizacao_id: req.utilizador.organizacao_id,
    };

    var perfilNome = req.utilizador.perfil ? req.utilizador.perfil.nome : "";
    var isColaborador = perfilNome === "Colaborador";

    if (isColaborador) {
      var colaborador = await Colaborador.findOne({
        where: { utilizador_id: req.utilizador.id, organizacao_id: req.utilizador.organizacao_id },
      });
      if (!colaborador) {
        return res.status(200).json({
          dados: [],
          paginacao: { total: 0, pagina: page, limite: limit, total_paginas: 0 },
        });
      }
      where.colaborador_id = colaborador.id;
    }

    if (estado) where.estado = estado;
    if (tipo) where.tipo = tipo;
    if (search) {
      where[Op.or] = [
        { titulo: { [Op.like]: "%" + search + "%" } },
        { descricao: { [Op.like]: "%" + search + "%" } },
        { "$colaborador.nome_completo$": { [Op.like]: "%" + search + "%" } },
        { "$colaborador.numero_colaborador$": { [Op.like]: "%" + search + "%" } },
      ];
    }

    var { count, rows } = await PedidoColaborador.findAndCountAll({
      where: where,
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
      subQuery: false,
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
    console.log("Erro ao listar pedidos:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getById = async function (req, res) {
  try {
    var pedido = await PedidoColaborador.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id"] },
      ],
    });

    if (!pedido) {
      return res.status(404).json({ error: "Pedido nao encontrado" });
    }

    return res.status(200).json({ dados: pedido });
  } catch (e) {
    console.log("Erro ao obter pedido:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Download do comprovativo anexado ao pedido. O administrador precisa de
// guardar o documento no computador, nao apenas de o abrir no browser.
// Um colaborador so descarrega os documentos dos seus proprios pedidos.
var downloadDocumento = async function (req, res) {
  try {
    var pedido = await PedidoColaborador.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
    });

    if (!pedido) {
      return res.status(404).json({ error: "Pedido nao encontrado" });
    }
    if (!pedido.documento) {
      return res.status(404).json({ error: "Este pedido nao tem documento anexado" });
    }

    var perfilNome = req.utilizador.perfil ? req.utilizador.perfil.nome : "";
    if (perfilNome === "Colaborador") {
      var meuRegisto = await Colaborador.findOne({
        where: { utilizador_id: req.utilizador.id, organizacao_id: req.utilizador.organizacao_id },
        attributes: ["id"],
      });
      if (!meuRegisto || String(meuRegisto.id) !== String(pedido.colaborador_id)) {
        return res.status(403).json({ error: "Sem permissao sobre este documento" });
      }
    }

    var enviado = await responderComFicheiro(res, pedido.documento, "comprovativo-" + (pedido.tipo || "documento") + ".pdf");
    if (!enviado) {
      return res.status(404).json({ error: "Nao foi possivel obter o documento" });
    }
  } catch (e) {
    console.log("Erro ao descarregar documento do pedido:", e.message);
    return res.status(500).json({ error: "Erro ao descarregar o documento" });
  }
};

var create = async function (req, res) {
  try {
    var dados = req.body;

    if (!dados.tipo || !dados.titulo) {
      return res.status(400).json({ error: "tipo e titulo sao obrigatorios" });
    }

    var colaborador = await Colaborador.findOne({
      where: { utilizador_id: req.utilizador.id, organizacao_id: req.utilizador.organizacao_id },
    });

    if (!colaborador) {
      return res.status(400).json({ error: "Colaborador nao encontrado para o utilizador actual" });
    }

    var dadosParsed = dados.dados || null;
    if (typeof dadosParsed === "string") {
      try { dadosParsed = JSON.parse(dadosParsed); } catch (e) { dadosParsed = { raw: dadosParsed }; }
    }

    if (dados.tipo === "credito") {
      var elegibilidade = await avaliarElegibilidadeCredito(colaborador.id, {
        valor: dadosParsed && dadosParsed.valor,
        parcelas: dadosParsed && dadosParsed.parcelas,
      });
      if (!elegibilidade.elegivel) {
        return res.status(400).json({
          error: "Pedido de crédito não elegível",
          motivos: elegibilidade.motivos,
          dados: elegibilidade,
        });
      }
      dadosParsed = Object.assign({}, dadosParsed, {
        elegibilidade: elegibilidade,
        prestacao_mensal: elegibilidade.prestacao_mensal,
        parcelas: elegibilidade.parcelas,
        valor: elegibilidade.valor_solicitado,
      });
    }

    var pedido = await PedidoColaborador.create({
      organizacao_id: req.utilizador.organizacao_id,
      colaborador_id: colaborador.id,
      tipo: dados.tipo,
      titulo: dados.titulo,
      descricao: dados.descricao || null,
      estado: "pendente",
      dados: dadosParsed,
    });

    if (req.files && req.files.ficheiro) {
      var guardado = await guardarFicheiro({
        file: req.files.ficheiro,
        pasta: "pedidos",
        organizacao_id: req.utilizador.organizacao_id,
        carregado_por: req.utilizador.id,
      });
      await pedido.update({ documento: urlDoFicheiro(guardado) });
    }

    var resultado = await PedidoColaborador.findByPk(pedido.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id"] },
      ],
    });

    try {
      var tipoLabels = { ferias: "Férias", adiantamento: "Adiantamento", justificacao: "Justificação", aumento: "Aumento", dispensa: "Dispensa", licenca: "Licença", credito: "Crédito", outro: "Outro" };
      var tipoNome = tipoLabels[pedido.tipo] || pedido.tipo;
      var notificados = {};

      function avisar(utilizadorId, titulo, mensagem, link, tipo) {
        if (!utilizadorId || notificados[utilizadorId]) return;
        notificados[utilizadorId] = true;
        return notificacaoController.create({
          organizacao_id: req.utilizador.organizacao_id,
          utilizador_id: utilizadorId,
          titulo: titulo,
          mensagem: mensagem,
          tipo: tipo || "info",
          link: link,
          modulo: "pedidos",
        });
      }

      // Confirmacao para quem submeteu o pedido.
      await avisar(
        colaborador.utilizador_id,
        "Pedido submetido",
        "O seu pedido de " + tipoNome + " foi recebido e está Em análise.",
        "/dashboard/portal",
        "success"
      );

      // RH e administradores da mesma organizacao.
      var adminPerfis = ["Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"];
      var adminPerfisRows = await Perfil.findAll({
        where: { nome: { [Op.in]: adminPerfis } },
      });
      if (adminPerfisRows.length > 0) {
        var adminPerfilIds = adminPerfisRows.map(function (p) { return p.id; });
        var admins = await Utilizador.findAll({
          where: { perfil_id: { [Op.in]: adminPerfilIds }, organizacao_id: req.utilizador.organizacao_id },
        });
        for (var i = 0; i < admins.length; i++) {
          await avisar(
            admins[i].id,
            "Novo Pedido",
            colaborador.nome_completo + " submeteu um pedido de " + tipoNome + ": " + pedido.titulo,
            "/dashboard/pedidos",
            "info"
          );
        }
      }

      // Supervisores/responsaveis da unidade, seccao e departamento do colaborador.
      var responsaveis = await obterIdsResponsaveis(colaborador, req.utilizador.organizacao_id);
      for (var j = 0; j < responsaveis.length; j++) {
        await avisar(
          responsaveis[j],
          "Novo Pedido na equipa",
          colaborador.nome_completo + " submeteu um pedido de " + tipoNome + ": " + pedido.titulo + ". Verifique em Em análise.",
          "/dashboard/pedidos",
          "warning"
        );
      }
    } catch (notifErr) {
      console.log("Aviso: nao foi possivel criar notificacoes do pedido:", notifErr.message);
    }

    return res.status(201).json({
      mensagem: "Pedido criado com sucesso",
      dados: resultado,
    });
  } catch (e) {
    console.log("Erro ao criar pedido:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var updateEstado = async function (req, res) {
  try {
    var pedido = await PedidoColaborador.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id"] },
      ],
    });

    if (!pedido) {
      return res.status(404).json({ error: "Pedido nao encontrado" });
    }

    var novoEstado = req.body.estado;
    if (!novoEstado || ["processando", "aprovado", "rejeitado"].indexOf(novoEstado) === -1) {
      return res.status(400).json({ error: "Estado invalido. Use 'processando', 'aprovado' ou 'rejeitado'" });
    }

    // 'pendente' aceita os tres destinos. 'processando' (o admin ja aceitou o
    // pedido e esta a trata-lo) aceita apenas a decisao final. Os restantes
    // estados ja tem decisao e nao voltam atras por esta via.
    var estadoAnterior = pedido.estado;
    if (estadoAnterior !== "pendente" && estadoAnterior !== "processando") {
      return res.status(400).json({ error: "Este pedido ja foi decidido e nao pode voltar a ser analisado" });
    }
    if (estadoAnterior === "processando" && novoEstado === "processando") {
      return res.status(400).json({ error: "O pedido ja esta em analise" });
    }

    var dadosEstado = { estado: novoEstado };
    if (novoEstado === "processando") {
      // Ainda nao ha resposta ao colaborador, por isso responded_by/responded_at
      // ficam vazios ate a decisao final. O comentario e opcional nesta fase.
      if (req.body.comentario) dadosEstado.comentario = req.body.comentario;
    } else {
      dadosEstado.responded_by = req.utilizador.id;
      dadosEstado.responded_at = new Date();
      dadosEstado.comentario = req.body.comentario || null;
    }

    if (pedido.tipo === "credito") {
      var dadosCredito = dadosDoPedido(pedido);
      var alteracoesCredito = req.body.dadosCredito || null;
      if (alteracoesCredito && (alteracoesCredito.valor != null || alteracoesCredito.parcelas != null)) {
        var novoValor = alteracoesCredito.valor != null
          ? Number(alteracoesCredito.valor)
          : Number(dadosCredito.valor || 0);
        var novasParcelas = alteracoesCredito.parcelas != null
          ? parseInt(alteracoesCredito.parcelas, 10)
          : parseInt(dadosCredito.parcelas || 0, 10);
        var reavaliacao = await avaliarElegibilidadeCredito(pedido.colaborador_id, {
          valor: novoValor,
          parcelas: novasParcelas,
        });
        if (!reavaliacao.elegivel) {
          return res.status(400).json({
            error: "Crédito não elegível com os dados alterados",
            motivos: reavaliacao.motivos,
            dados: reavaliacao,
          });
        }
        dadosCredito = Object.assign({}, dadosCredito, {
          valor: reavaliacao.valor_solicitado,
          parcelas: reavaliacao.parcelas,
          prestacao_mensal: reavaliacao.prestacao_mensal,
          elegibilidade: reavaliacao,
        });
      }
      if (novoEstado === "aprovado" && !dadosCredito.documento_assinado) {
        return res.status(400).json({ error: "Anexe a ficha de crédito assinada antes de aprovar" });
      }
      // Copia mới: Sequelize so guarda o campo JSON quando a referencia muda.
      dadosEstado.dados = Object.assign({}, dadosCredito);
    }

    await pedido.update(dadosEstado);

    if (novoEstado === "aprovado" && pedido.tipo === "credito") {
      try {
        var dadosCreditoAprovado = dadosDoPedido(pedido);
        var elegibilidadeAprovada = dadosCreditoAprovado.elegibilidade ||
          await avaliarElegibilidadeCredito(pedido.colaborador_id, {
            valor: dadosCreditoAprovado.valor,
            parcelas: dadosCreditoAprovado.parcelas,
          });
        var prestacaoAprovada = Number(dadosCreditoAprovado.prestacao_mensal || elegibilidadeAprovada.prestacao_mensal || 0);
        var existeCredito = await Credito.findOne({
          where: {
            colaborador_id: pedido.colaborador_id,
            valor: dadosCreditoAprovado.valor,
            desconto_mensal: prestacaoAprovada,
            motivo: "Crédito aprovado via pedido " + pedido.id,
          },
        });
        if (!existeCredito) {
          await Credito.create({
            colaborador_id: pedido.colaborador_id,
            valor: dadosCreditoAprovado.valor,
            desconto_mensal: prestacaoAprovada,
            valor_pago: 0,
            data_concessao: new Date().toISOString().substring(0, 10),
            motivo: "Crédito aprovado via pedido " + pedido.id,
            estado: "Ativo",
            criado_por: req.utilizador.id,
          });
        }
      } catch (creditoErr) {
        console.log("Erro ao criar crédito aprovado:", creditoErr.message);
      }
    }

    if (novoEstado === "aprovado" && pedido.tipo === "justificacao") {
      try {
        var dadosJustificacao = null;
        if (pedido.dados) {
          dadosJustificacao = typeof pedido.dados === "string" ? JSON.parse(pedido.dados) : pedido.dados;
        }
        var registo = null;
        if (dadosJustificacao && dadosJustificacao.registos_presenca_id) {
          registo = await RegistoPresenca.findByPk(dadosJustificacao.registos_presenca_id);
        }
        if (!registo && dadosJustificacao && dadosJustificacao.data) {
          registo = await RegistoPresenca.findOne({
            where: {
              colaborador_id: pedido.colaborador_id,
              data: dadosJustificacao.data,
            },
          });
        }
        if (registo) {
          await registo.update({
            justificado: true,
            justificacao_observacoes: pedido.comentario || dadosJustificacao.tipo || null,
            // O comprovativo anexado no pedido fica também no registo de
            // presença, para o admin o ver na página de faltas ("Ver Doc").
            documento_justificacao: pedido.documento || registo.documento_justificacao || null,
          });
          console.log("Falta justificada via pedido:", registo.id, "data:", registo.data);
        }
      } catch (justErr) {
        console.log("Erro ao justificar falta via pedido:", justErr.message);
      }
    }

    // Dispensa aprovada: as horas em falta do periodo ficam justificadas
    // automaticamente no banco (nao geram divida nem desconto).
    if (novoEstado === "aprovado" && pedido.tipo === "dispensa") {
      try {
        var justificadas = await justificarDispensa(pedido);
        if (justificadas > 0) {
          console.log("Banco de horas: " + justificadas + " movimento(s) justificado(s) por dispensa");
        }
      } catch (bancoErr) {
        console.log("Erro ao justificar banco de horas via pedido:", bancoErr.message);
      }
    }

    var utilizadorColaborador = null;
    if (pedido.colaborador && pedido.colaborador.utilizador_id) {
      utilizadorColaborador = await Utilizador.findByPk(pedido.colaborador.utilizador_id);
    }
    console.log("Notificacao colaborador: colaborador_id=", pedido.colaborador_id, "utilizador_id=", pedido.colaborador ? pedido.colaborador.utilizador_id : "N/A", "encontrado=", !!utilizadorColaborador);

    if (utilizadorColaborador) {
      var tituloNotificacao = novoEstado === "aprovado"
        ? "Pedido Aprovado"
        : novoEstado === "rejeitado"
          ? "Pedido Rejeitado"
          : "Pedido em análise";
      var mensagemNotificacao = novoEstado === "aprovado"
        ? "O seu pedido '" + pedido.titulo + "' foi aprovado."
        : novoEstado === "rejeitado"
          ? "O seu pedido '" + pedido.titulo + "' foi rejeitado."
          : "O seu pedido '" + pedido.titulo + "' está em análise.";
      var tipoNotificacao = novoEstado === "aprovado"
        ? "success"
        : novoEstado === "rejeitado" ? "error" : "info";

      var notifResult = await notificacaoController.create({
        organizacao_id: req.utilizador.organizacao_id,
        utilizador_id: utilizadorColaborador.id,
        titulo: tituloNotificacao,
        mensagem: mensagemNotificacao,
        tipo: tipoNotificacao,
        link: "/dashboard/portal",
        modulo: "pedidos",
      });
      console.log("Notificacao criada:", !!notifResult);
    } else {
      console.log("Notificacao NAO criada: utilizador do colaborador nao encontrado. Verifique se o colaborador tem utilizador_id preenchido.");
    }

    var actualizado = await PedidoColaborador.findByPk(pedido.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id"] },
      ],
    });

    return res.status(200).json({
      mensagem: "Estado do pedido actualizado com sucesso",
      dados: actualizado,
    });
  } catch (e) {
    console.log("Erro ao actualizar estado do pedido:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var anexarDocumentoAssinado = async function (req, res) {
  try {
    var pedido = await PedidoColaborador.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
        tipo: "credito",
      },
    });
    if (!pedido) {
      return res.status(404).json({ error: "Pedido de crédito nao encontrado" });
    }
    if (["pendente", "processando"].indexOf(pedido.estado) === -1) {
      return res.status(400).json({ error: "Este pedido já foi decidido" });
    }
    if (!req.files || !req.files.ficheiro) {
      return res.status(400).json({ error: "Envie o ficheiro PDF assinado" });
    }

    var guardado = await guardarFicheiro({
      file: req.files.ficheiro,
      pasta: "pedidos",
      organizacao_id: req.utilizador.organizacao_id,
      carregado_por: req.utilizador.id,
    });
    var dados = dadosDoPedido(pedido);
    var dadosAtualizados = Object.assign({}, dados, {
      documento_assinado: urlDoFicheiro(guardado),
      documento_assinado_em: new Date().toISOString(),
    });
    await pedido.update({ dados: dadosAtualizados });

    return res.status(200).json({
      mensagem: "Ficha de crédito assinada anexada com sucesso",
      dados: pedido,
    });
  } catch (e) {
    console.log("Erro ao anexar ficha de crédito assinada:", e.message);
    return res.status(500).json({ error: "Erro ao anexar o documento assinado" });
  }
};

var getStats = async function (req, res) {
  try {
    var baseWhere = {
      organizacao_id: req.utilizador.organizacao_id,
    };

    var perfilNome = req.utilizador.perfil ? req.utilizador.perfil.nome : "";
    var isColaborador = perfilNome === "Colaborador";

    if (isColaborador) {
      var colaborador = await Colaborador.findOne({
        where: { utilizador_id: req.utilizador.id, organizacao_id: req.utilizador.organizacao_id },
      });
      if (colaborador) {
        baseWhere.colaborador_id = colaborador.id;
      }
    }

    var pendentes = await PedidoColaborador.count({
      where: Object.assign({}, baseWhere, { estado: "pendente" }),
    });

    var processando = await PedidoColaborador.count({
      where: Object.assign({}, baseWhere, { estado: "processando" }),
    });

    var aprovados = await PedidoColaborador.count({
      where: Object.assign({}, baseWhere, { estado: "aprovado" }),
    });

    var rejeitados = await PedidoColaborador.count({
      where: Object.assign({}, baseWhere, { estado: "rejeitado" }),
    });

    var cancelados = await PedidoColaborador.count({
      where: Object.assign({}, baseWhere, { estado: "cancelado" }),
    });

    return res.status(200).json({
      dados: {
        pendentes: pendentes,
        processando: processando,
        aprovados: aprovados,
        rejeitados: rejeitados,
        cancelados: cancelados,
        total: pendentes + processando + aprovados + rejeitados + cancelados,
      },
    });
  } catch (e) {
    console.log("Erro ao obter estatisticas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var remove = async function (req, res) {
  try {
    var pedido = await PedidoColaborador.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
    });

    if (!pedido) {
      return res.status(404).json({ error: "Pedido nao encontrado" });
    }

    if (pedido.documento) {
      await apagarFicheiroDeUrl(pedido.documento);
    }
    var dadosRemocao = dadosDoPedido(pedido);
    if (dadosRemocao.documento_assinado) {
      await apagarFicheiroDeUrl(dadosRemocao.documento_assinado);
    }

    await pedido.destroy();

    return res.status(200).json({ mensagem: "Pedido eliminado com sucesso" });
  } catch (e) {
    console.log("Erro ao eliminar pedido:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { list, getById, create, updateEstado, getStats, remove, downloadDocumento, anexarDocumentoAssinado };
