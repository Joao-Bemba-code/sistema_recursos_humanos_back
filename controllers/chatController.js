var { Op } = require("sequelize");
var { Conversa, ConversaParticipante, Mensagem, Utilizador, Colaborador } = require("../models");
var { guardarFicheiro, responderComFicheiro } = require("../helpers/ficheiros");

var MAX_TEXTO = 2000;

var remetenteInclude = function () {
  return { model: Utilizador, as: "remetente", attributes: ["id", "nome_completo", "fotografia"] };
};

// O canal geral e unico por organizacao; e criado a primeira vez que alguem
// o abre ou escreve nele.
var garantirGeral = async function (organizacaoId) {
  var geral = await Conversa.findOne({ where: { organizacao_id: organizacaoId, tipo: "geral" } });
  if (geral) return geral;
  return await Conversa.create({ organizacao_id: organizacaoId, tipo: "geral", titulo: "Geral" });
};

// Ate quando o utilizador leu: usa a ultima_leitura ou, sem registo, o
// momento em que a conta foi criada (mensagens antigas nao contam como novas).
var limiteLeitura = function (participacao, utilizador) {
  if (participacao && participacao.ultima_leitura) return new Date(participacao.ultima_leitura);
  return new Date((utilizador && utilizador.createdAt) || 0);
};

var naoLidasDe = async function (conversaId, utilizador) {
  var participacao = await ConversaParticipante.findOne({
    where: { conversa_id: conversaId, utilizador_id: utilizador.id },
  });
  return await Mensagem.count({
    where: {
      conversa_id: conversaId,
      utilizador_id: { [Op.ne]: utilizador.id },
      createdAt: { [Op.gt]: limiteLeitura(participacao, utilizador) },
    },
  });
};

// Garante a participacao do utilizador (usado quando abre ou escreve no geral)
// e marca a leitura ate agora.
var marcarLido = async function (conversaId, utilizadorId) {
  var p = await ConversaParticipante.findOne({
    where: { conversa_id: conversaId, utilizador_id: utilizadorId },
  });
  if (!p) {
    p = await ConversaParticipante.create({
      conversa_id: conversaId,
      utilizador_id: utilizadorId,
      ultima_leitura: new Date(),
    });
    return p;
  }
  p.ultima_leitura = new Date();
  await p.save();
  return p;
};

// ==================== CONVERSAS ====================

// Devolve as conversas do utilizador: o geral em primeiro, depois as directas
// ordenadas pela ultima mensagem. Cada entrada traz o outro utilizador (nas
// directas), a ultima mensagem e o numero de nao lidas.
var listConversas = async function (req, res) {
  try {
    var orgId = req.utilizador.organizacao_id;
    var eu = req.utilizador.id;

    var geral = await garantirGeral(orgId);

    var minhas = await ConversaParticipante.findAll({ where: { utilizador_id: eu } });
    var ids = minhas.map(function (p) { return p.conversa_id; });
    if (ids.indexOf(geral.id) === -1) ids.push(geral.id);

    var conversas = await Conversa.findAll({
      where: { id: { [Op.in]: ids }, organizacao_id: orgId },
      order: [["createdAt", "ASC"]],
    });

    var mapaPart = {};
    minhas.forEach(function (p) { mapaPart[p.conversa_id] = p; });

    var saida = [];
    for (var i = 0; i < conversas.length; i++) {
      var c = conversas[i];
      var participacao = c.tipo === "geral" ? (mapaPart[c.id] || null) : (mapaPart[c.id] || null);

      var item = {
        id: c.id,
        tipo: c.tipo,
        titulo: c.tipo === "geral" ? (c.titulo || "Geral") : null,
        outro: null,
        ultima_mensagem: null,
        ultima_em: null,
        nao_lidas: 0,
      };

      if (c.tipo === "direta") {
        var outroPart = await ConversaParticipante.findOne({
          where: { conversa_id: c.id, utilizador_id: { [Op.ne]: eu } },
          include: [{ model: Utilizador, as: "utilizador", attributes: ["id", "nome_completo", "fotografia"] }],
        });
        if (outroPart && outroPart.utilizador) {
          item.outro = outroPart.utilizador;
          item.titulo = outroPart.utilizador.nome_completo;
        } else {
          item.titulo = "Conversa";
        }
      }

      var ultima = await Mensagem.findOne({
        where: { conversa_id: c.id },
        order: [["createdAt", "DESC"]],
        include: [remetenteInclude()],
      });
      if (ultima) {
        item.ultima_mensagem = ultima.texto;
        item.ultima_em = ultima.createdAt;
        item.ultimo_remetente = ultima.remetente ? ultima.remetente.nome_completo : null;
      }

      item.nao_lidas = await naoLidasDe(c.id, req.utilizador);

      saida.push(item);
    }

    saida.sort(function (a, b) {
      if (a.tipo === "geral" && b.tipo !== "geral") return -1;
      if (b.tipo === "geral" && a.tipo !== "geral") return 1;
      var ta = a.ultima_em ? new Date(a.ultima_em).getTime() : 0;
      var tb = b.ultima_em ? new Date(b.ultima_em).getTime() : 0;
      return tb - ta;
    });

    return res.status(200).json({ dados: saida });
  } catch (e) {
    console.log("Erro ao listar conversas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Total de mensagens por ler em todas as conversas (badge do menu).
var naoLidas = async function (req, res) {
  try {
    var orgId = req.utilizador.organizacao_id;
    var eu = req.utilizador.id;
    var total = 0;

    var geral = await Conversa.findOne({ where: { organizacao_id: orgId, tipo: "geral" } });
    if (geral) total += await naoLidasDe(geral.id, req.utilizador);

    var minhas = await ConversaParticipante.findAll({ where: { utilizador_id: eu } });
    for (var i = 0; i < minhas.length; i++) {
      var c = await Conversa.findOne({
        where: { id: minhas[i].conversa_id, organizacao_id: orgId },
      });
      if (!c) continue;
      total += await naoLidasDe(c.id, req.utilizador);
    }

    return res.status(200).json({ dados: { total: total } });
  } catch (e) {
    console.log("Erro ao contar nao lidas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Utilizadores com quem o utilizador actual pode conversar (todos os
// utilizadores activos da organizacao, excepto ele proprio).
// Pessoas com quem se pode iniciar uma conversa: todos os colaboradores activos
// da organizacao (tenham ou nao conta de acesso) e os utilizadores que nao tem
// ficha de colaborador (administracao). O campo `id` e o id do utilizador, que
// e o que o chat usa; quando a pessoa ainda nao tem conta vem null e
// `tem_acesso: false`, para o ecra a mostrar bloqueada.
var listarUtilizadores = async function (req, res) {
  try {
    var orgId = req.utilizador.organizacao_id;
    var eu = req.utilizador.id;

    var colaboradores = await Colaborador.findAll({
      where: { organizacao_id: orgId, estado: "Activo" },
      attributes: ["id", "nome_completo", "nome_curto", "email_institucional", "email_pessoal", "fotografia", "utilizador_id"],
      order: [["nome_completo", "ASC"]],
    });

    var utilizadores = await Utilizador.findAll({
      where: { organizacao_id: orgId, activo: true },
      attributes: ["id", "nome_completo", "email", "fotografia"],
    });

    var porId = {};
    utilizadores.forEach(function (u) { porId[u.id] = u; });

    var lista = [];
    var vistos = {};

    colaboradores.forEach(function (c) {
      var u = c.utilizador_id ? porId[c.utilizador_id] : null;
      if (u && String(u.id) === String(eu)) return;
      var chave = u ? "u:" + u.id : "c:" + c.id;
      if (vistos[chave]) return;
      vistos[chave] = true;
      lista.push({
        id: u ? u.id : null,
        colaborador_id: c.id,
        nome_completo: (u && u.nome_completo) || c.nome_completo || c.nome_curto || "Colaborador",
        email: (u && u.email) || c.email_institucional || c.email_pessoal || null,
        fotografia: (u && u.fotografia) || c.fotografia || null,
        tem_acesso: !!u,
      });
    });

    // Utilizadores sem ficha de colaborador (ex.: contas de administracao).
    utilizadores.forEach(function (u) {
      if (String(u.id) === String(eu)) return;
      if (vistos["u:" + u.id]) return;
      lista.push({
        id: u.id,
        colaborador_id: null,
        nome_completo: u.nome_completo || u.email || "Utilizador",
        email: u.email || null,
        fotografia: u.fotografia || null,
        tem_acesso: true,
      });
    });

    lista.sort(function (a, b) {
      return String(a.nome_completo || "").localeCompare(String(b.nome_completo || ""), "pt");
    });

    return res.status(200).json({ dados: lista });
  } catch (e) {
    console.log("Erro ao listar utilizadores do chat:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== MENSAGENS ====================

// Verifica que o utilizador pode ver esta conversa (organizacao + participante
// ou canal geral). Devolve { erro } ou { conversa }.
var carregarConversa = async function (req) {
  var conversa = await Conversa.findOne({
    where: { id: req.params.id, organizacao_id: req.utilizador.organizacao_id },
  });
  if (!conversa) return { erro: { status: 404, mensagem: "Conversa nao encontrada" } };
  if (conversa.tipo === "geral") return { conversa: conversa };

  var participacao = await ConversaParticipante.findOne({
    where: { conversa_id: conversa.id, utilizador_id: req.utilizador.id },
  });
  if (!participacao) return { erro: { status: 403, mensagem: "Sem permissao sobre esta conversa" } };
  return { conversa: conversa };
};

// Ultimas mensagens da conversa (mais recentes primeiro, devolvidas em ordem
// crescente). Marca a conversa como lida para o utilizador actual.
var listMensagens = async function (req, res) {
  try {
    var carregada = await carregarConversa(req);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    var conversa = carregada.conversa;

    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 50;
    if (limit > 100) limit = 100;
    var offset = (page - 1) * limit;

    var { count, rows } = await Mensagem.findAndCountAll({
      where: { conversa_id: conversa.id },
      include: [remetenteInclude()],
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
    });

    rows.reverse();

    await marcarLido(conversa.id, req.utilizador.id);

    var titulo = conversa.tipo === "geral" ? (conversa.titulo || "Geral") : null;
    if (conversa.tipo === "direta") {
      var outroPart = await ConversaParticipante.findOne({
        where: { conversa_id: conversa.id, utilizador_id: { [Op.ne]: req.utilizador.id } },
        include: [{ model: Utilizador, as: "utilizador", attributes: ["id", "nome_completo", "fotografia"] }],
      });
      if (outroPart && outroPart.utilizador) {
        titulo = outroPart.utilizador.nome_completo;
      }
    }

    return res.status(200).json({
      dados: {
        conversa: { id: conversa.id, tipo: conversa.tipo, titulo: titulo },
        mensagens: rows,
        total: count,
      },
    });
  } catch (e) {
    console.log("Erro ao listar mensagens:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Envia uma mensagem. Aceita:
//   { texto, conversa_id }         - responde numa conversa existente
//   { texto, utilizador_id }       - conversa directa com outro utilizador
//                                    (cria a conversa se ainda nao existir)
//   { texto, geral: true }         - escreve no canal geral
// Em multipart pode trazer tambem um ficheiro no campo "ficheiro"; nesse caso
// o texto pode vir vazio (mensagem so com anexo).
var enviarMensagem = async function (req, res) {
  try {
    var texto = req.body && req.body.texto ? String(req.body.texto).trim() : "";
    var ficheiroEnviado = req.files && req.files.ficheiro ? req.files.ficheiro : null;

    if (!texto && !ficheiroEnviado) {
      return res.status(400).json({ error: "Escreva a mensagem" });
    }
    if (texto.length > MAX_TEXTO) {
      return res.status(400).json({ error: "Mensagem demasiado longa (maximo " + MAX_TEXTO + " caracteres)" });
    }

    var orgId = req.utilizador.organizacao_id;
    var eu = req.utilizador.id;
    var conversa = null;

    if (req.body && req.body.geral) {
      conversa = await garantirGeral(orgId);
      await marcarLido(conversa.id, eu);
    } else if (req.body && req.body.utilizador_id) {
      var alvo = await Utilizador.findOne({
        where: { id: req.body.utilizador_id, organizacao_id: orgId, activo: true },
      });
      if (!alvo) {
        return res.status(404).json({ error: "Utilizador nao encontrado" });
      }
      if (String(alvo.id) === String(eu)) {
        return res.status(400).json({ error: "Nao pode enviar mensagens a si proprio" });
      }

      // Procura uma conversa directa ja existente entre os dois.
      var minhas = await ConversaParticipante.findAll({ where: { utilizador_id: eu } });
      var meusIds = minhas.map(function (p) { return p.conversa_id; });
      var partAlvo = null;
      if (meusIds.length > 0) {
        partAlvo = await ConversaParticipante.findOne({
          where: { conversa_id: { [Op.in]: meusIds }, utilizador_id: alvo.id },
        });
      }
      if (partAlvo) {
        conversa = await Conversa.findOne({
          where: { id: partAlvo.conversa_id, organizacao_id: orgId, tipo: "direta" },
        });
      }
      if (!conversa) {
        conversa = await Conversa.create({ organizacao_id: orgId, tipo: "direta" });
        await ConversaParticipante.create({ conversa_id: conversa.id, utilizador_id: eu, ultima_leitura: new Date() });
        await ConversaParticipante.create({ conversa_id: conversa.id, utilizador_id: alvo.id, ultima_leitura: null });
      } else {
        await marcarLido(conversa.id, eu);
      }
    } else if (req.body && req.body.conversa_id) {
      var carregada = await carregarConversa({
        params: { id: req.body.conversa_id },
        utilizador: req.utilizador,
      });
      if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
      conversa = carregada.conversa;
      await marcarLido(conversa.id, eu);
    } else {
      return res.status(400).json({ error: "Indique conversa_id, utilizador_id ou geral" });
    }

    var anexo = null;
    if (ficheiroEnviado) {
      var guardado = null;
      try {
        guardado = await guardarFicheiro({
          file: ficheiroEnviado,
          pasta: "chat",
          organizacao_id: orgId,
          carregado_por: eu,
        });
      } catch (eFicheiro) {
        return res.status(400).json({ error: eFicheiro.message || "Nao foi possivel guardar o ficheiro" });
      }
      anexo = {
        url: guardado.url,
        nome: ficheiroEnviado.name || guardado.nome || "anexo",
        tipo: guardado.tipo || null,
        tamanho: guardado.tamanho || null,
      };
    }

    var mensagem = await Mensagem.create({
      conversa_id: conversa.id,
      utilizador_id: eu,
      texto: texto,
      anexo_url: anexo ? anexo.url : null,
      anexo_nome: anexo ? anexo.nome : null,
      anexo_tipo: anexo ? anexo.tipo : null,
      anexo_tamanho: anexo ? anexo.tamanho : null,
    });

    var criada = await Mensagem.findByPk(mensagem.id, { include: [remetenteInclude()] });

    return res.status(201).json({ mensagem: "Mensagem enviada", dados: criada });
  } catch (e) {
    console.log("Erro ao enviar mensagem:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Descarrega o anexo de uma mensagem (imagem, PDF ou documento). Passa pelo
// servidor porque o Cloudinary recusa a entrega directa de PDF/ZIP e porque
// o URL guardado pode ser um caminho antigo (/uploads/...).
var baixarAnexo = async function (req, res) {
  try {
    var mensagem = await Mensagem.findByPk(req.params.id);
    if (!mensagem) {
      return res.status(404).json({ error: "Mensagem nao encontrada" });
    }

    var carregada = await carregarConversa({
      params: { id: mensagem.conversa_id },
      utilizador: req.utilizador,
    });
    if (carregada.erro) {
      return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    }

    if (!mensagem.anexo_url) {
      return res.status(404).json({ error: "Esta mensagem nao tem anexo" });
    }

    var enviado = await responderComFicheiro(
      res,
      mensagem.anexo_url,
      mensagem.anexo_nome || "anexo"
    );
    if (!enviado) {
      return res.status(404).json({ error: "Nao foi possivel obter o anexo" });
    }
  } catch (e) {
    console.log("Erro ao descarregar anexo do chat:", e.message);
    return res.status(500).json({ error: "Erro ao descarregar o anexo" });
  }
};

// Cria (ou devolve a existente) a conversa directa com outro utilizador,
// sem enviar mensagem nenhuma - usada pelo botao "Nova conversa".
var abrirConversa = async function (req, res) {
  try {
    var orgId = req.utilizador.organizacao_id;
    var eu = req.utilizador.id;
    var alvoId = req.body && req.body.utilizador_id;

    if (!alvoId) {
      return res.status(400).json({ error: "Indique utilizador_id" });
    }
    var alvo = await Utilizador.findOne({
      where: { id: alvoId, organizacao_id: orgId, activo: true },
      attributes: ["id", "nome_completo", "fotografia"],
    });
    if (!alvo) {
      return res.status(404).json({ error: "Utilizador nao encontrado" });
    }
    if (String(alvo.id) === String(eu)) {
      return res.status(400).json({ error: "Nao pode conversar consigo proprio" });
    }

    var minhas = await ConversaParticipante.findAll({ where: { utilizador_id: eu } });
    var meusIds = minhas.map(function (p) { return p.conversa_id; });
    var partAlvo = null;
    if (meusIds.length > 0) {
      partAlvo = await ConversaParticipante.findOne({
        where: { conversa_id: { [Op.in]: meusIds }, utilizador_id: alvo.id },
      });
    }
    var conversa = null;
    if (partAlvo) {
      conversa = await Conversa.findOne({
        where: { id: partAlvo.conversa_id, organizacao_id: orgId, tipo: "direta" },
      });
    }
    if (!conversa) {
      conversa = await Conversa.create({ organizacao_id: orgId, tipo: "direta" });
      await ConversaParticipante.create({ conversa_id: conversa.id, utilizador_id: eu, ultima_leitura: new Date() });
      await ConversaParticipante.create({ conversa_id: conversa.id, utilizador_id: alvo.id, ultima_leitura: null });
    }

    return res.status(200).json({
      dados: { id: conversa.id, tipo: "direta", titulo: alvo.nome_completo, outro: alvo },
    });
  } catch (e) {
    console.log("Erro ao abrir conversa:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { listConversas, naoLidas, listarUtilizadores, listMensagens, enviarMensagem, baixarAnexo, abrirConversa };
