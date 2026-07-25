var { Op } = require("sequelize");
var path = require("path");
var fs = require("fs");
var { PedidoColaborador, Colaborador, Utilizador, Perfil, Notificacao, RegistoPresenca } = require("../models");
var notificacaoController = require("./notificacaoController");

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
      var ficheiro = req.files.ficheiro;
      var ext = path.extname(ficheiro.name) || ".pdf";
      var filename = "pedido_" + pedido.id + "_" + Date.now() + ext;
      var uploadDir = path.join(__dirname, "..", "uploads", "pedidos");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      var caminho = path.join(uploadDir, filename);
      await ficheiro.mv(caminho);
      await pedido.update({ documento: "/uploads/pedidos/" + filename });
    }

    var resultado = await PedidoColaborador.findByPk(pedido.id, {
      include: [
        { model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador", "utilizador_id"] },
      ],
    });

    try {
      var adminPerfis = ["Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"];
      var adminPerfisRows = await Perfil.findAll({
        where: { nome: { [Op.in]: adminPerfis } },
      });
      if (adminPerfisRows.length > 0) {
        var adminPerfilIds = adminPerfisRows.map(function (p) { return p.id; });
        var admins = await Utilizador.findAll({
          where: { perfil_id: { [Op.in]: adminPerfilIds }, organizacao_id: req.utilizador.organizacao_id },
        });
        var tipoLabels = { ferias: "Férias", adiantamento: "Adiantamento", justificacao: "Justificação", aumento: "Aumento", outro: "Outro" };
        for (var i = 0; i < admins.length; i++) {
          await notificacaoController.create({
            organizacao_id: req.utilizador.organizacao_id,
            utilizador_id: admins[i].id,
            titulo: "Novo Pedido",
            mensagem: colaborador.nome_completo + " submeteu um pedido de " + (tipoLabels[pedido.tipo] || pedido.tipo) + ": " + pedido.titulo,
            tipo: "info",
            link: "/dashboard/pedidos",
          });
        }
      }
    } catch (notifErr) {
      console.log("Aviso: nao foi possivel criar notificacao para admins:", notifErr.message);
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
    if (!novoEstado || ["aprovado", "rejeitado"].indexOf(novoEstado) === -1) {
      return res.status(400).json({ error: "Estado invalido. Use 'aprovado' ou 'rejeitado'" });
    }

    if (pedido.estado !== "pendente") {
      return res.status(400).json({ error: "Apenas pedidos pendentes podem ser processados" });
    }

    await pedido.update({
      estado: novoEstado,
      responded_by: req.utilizador.id,
      responded_at: new Date(),
      comentario: req.body.comentario || null,
    });

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
          });
          console.log("Falta justificada via pedido:", registo.id, "data:", registo.data);
        }
      } catch (justErr) {
        console.log("Erro ao justificar falta via pedido:", justErr.message);
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
        : "Pedido Rejeitado";
      var mensagemNotificacao = novoEstado === "aprovado"
        ? "O seu pedido '" + pedido.titulo + "' foi aprovado."
        : "O seu pedido '" + pedido.titulo + "' foi rejeitado.";
      var tipoNotificacao = novoEstado === "aprovado" ? "success" : "error";

      var notifResult = await notificacaoController.create({
        organizacao_id: req.utilizador.organizacao_id,
        utilizador_id: utilizadorColaborador.id,
        titulo: tituloNotificacao,
        mensagem: mensagemNotificacao,
        tipo: tipoNotificacao,
        link: "/dashboard/portal",
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
        aprovados: aprovados,
        rejeitados: rejeitados,
        cancelados: cancelados,
        total: pendentes + aprovados + rejeitados + cancelados,
      },
    });
  } catch (e) {
    console.log("Erro ao obter estatisticas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { list, getById, create, updateEstado, getStats };
