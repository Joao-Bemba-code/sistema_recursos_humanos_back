var { Op } = require("sequelize");
var { Conversa, ConversaParticipante, Chamada, ChamadaSinal, Utilizador } = require("../models");

// ==================== CONFERENCIA (CHAMADAS) ====================
// Chamadas de voz/video em conversas directas, grupos e no canal geral.
// O audio/video segue por WebRTC entre os navegadores; cada par de
// participantes trata-se por si (malha). O servidor guarda so o estado da
// chamada e os sinais de negociacao, que os ecras vo buscar por polling.

var MAX_CORPO_SINAL = 20000;

// Depois de 60 segundos a tocar sem ninguem aceitar, a chamada caduca.
var VALIDA_TOQUE_MS = 60000;

var iniciarInclude = function () {
  return { model: Utilizador, as: "iniciador", attributes: ["id", "nome_completo", "fotografia"] };
};

var parseLista = function (txt) {
  try {
    var v = JSON.parse(txt);
    return Array.isArray(v) ? v.map(String) : [];
  } catch (e) {
    return [];
  }
};

// Verifica que a conversa existe na organizacao e que o utilizador pode
// chamar: no geral basta pertencer a organizacao; em directas e grupos e
// preciso ser participante.
var carregarParaChamada = async function (conversaId, utilizador) {
  if (!conversaId) return { erro: { status: 400, mensagem: "Indique a conversa" } };
  var conversa = await Conversa.findOne({
    where: { id: conversaId, organizacao_id: utilizador.organizacao_id },
  });
  if (!conversa) return { erro: { status: 404, mensagem: "Conversa nao encontrada" } };
  if (conversa.tipo !== "geral") {
    var participacao = await ConversaParticipante.findOne({
      where: { conversa_id: conversa.id, utilizador_id: utilizador.id },
    });
    if (!participacao) return { erro: { status: 403, mensagem: "Sem permissao sobre esta conversa" } };
  }
  return { conversa: conversa };
};

// Carrega a chamada e verifica se o utilizador pode participa (mesmas
// regras da conversa).
var carregarMinhaChamada = async function (req) {
  var chamada = await Chamada.findByPk(req.params.id);
  if (!chamada || String(chamada.organizacao_id) !== String(req.utilizador.organizacao_id)) {
    return { erro: { status: 404, mensagem: "Chamada nao encontrada" } };
  }
  var carregada = await carregarParaChamada(chamada.conversa_id, req.utilizador);
  if (carregada.erro) return { erro: carregada.erro };
  return { chamada: chamada, conversa: carregada.conversa };
};

// Marca como sem_resposta as chamadas a tocar ha demasiado tempo.
var caducarToques = async function () {
  try {
    var limite = new Date(new Date().getTime() - VALIDA_TOQUE_MS);
    await Chamada.update(
      { estado: "sem_resposta" },
      { where: { estado: "a_tocar", createdAt: { [Op.lt]: limite } } }
    );
  } catch (e) {
    console.log("Aviso: ao caducar toques:", e.message);
  }
};

// Lista de quem esta vivo na chamada: iniciador + aceites, sem os que sairam.
var vivosDaChamada = function (chamada) {
  var aceites = parseLista(chamada.aceites);
  var saiu = parseLista(chamada.saiu);
  var ids = [String(chamada.iniciador_id)].concat(aceites);
  var unicos = [];
  ids.forEach(function (id) {
    if (unicos.indexOf(id) === -1 && saiu.indexOf(id) === -1) unicos.push(id);
  });
  return unicos;
};

// POST /api/chat/chamadas  { conversa_id, tipo }
var criarChamada = async function (req, res) {
  try {
    var carregada = await carregarParaChamada(req.body && req.body.conversa_id, req.utilizador);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });

    var tipo = req.body && req.body.tipo === "video" ? "video" : "audio";

    await caducarToques();

    var viva = await Chamada.findOne({
      where: { conversa_id: carregada.conversa.id, estado: { [Op.in]: ["a_tocar", "aceite"] } },
    });
    if (viva) {
      return res.status(409).json({ error: "Ja existe uma chamada em curso nesta conversa" });
    }

    var chamada = await Chamada.create({
      conversa_id: carregada.conversa.id,
      organizacao_id: req.utilizador.organizacao_id,
      iniciador_id: req.utilizador.id,
      tipo: tipo,
      estado: "a_tocar",
      aceites: "[]",
      saiu: "[]",
      recusados: "[]",
    });

    return res.status(201).json({
      dados: {
        id: chamada.id,
        conversa_id: chamada.conversa_id,
        tipo: chamada.tipo,
        estado: chamada.estado,
      },
    });
  } catch (e) {
    console.log("Erro ao criar chamada:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// GET /api/chat/chamadas/:id - estado, quem esta dentro e os nomes.
var obterChamada = async function (req, res) {
  try {
    await caducarToques();

    var carregada = await carregarMinhaChamada(req);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    var chamada = carregada.chamada;

    var vivos = vivosDaChamada(chamada);
    var outrosIds = vivos.filter(function (id) { return id !== String(req.utilizador.id); });
    var pessoas = [];
    if (outrosIds.length > 0) {
      pessoas = await Utilizador.findAll({
        where: { id: { [Op.in]: outrosIds } },
        attributes: ["id", "nome_completo", "fotografia"],
      });
    }

    return res.status(200).json({
      dados: {
        id: chamada.id,
        conversa_id: chamada.conversa_id,
        tipo: chamada.tipo,
        estado: chamada.estado,
        iniciador_id: String(chamada.iniciador_id),
        vivos: vivos,
        saiu: parseLista(chamada.saiu),
        recusados: parseLista(chamada.recusados),
        membros: pessoas.map(function (p) {
          return { id: p.id, nome_completo: p.nome_completo, fotografia: p.fotografia };
        }),
      },
    });
  } catch (e) {
    console.log("Erro ao obter chamada:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// GET /api/chat/chamadas/pendentes - chamadas a tocar para mim (em directas,
// grupos e no geral), sem as que eu proprio iniciei.
var pendentes = async function (req, res) {
  try {
    await caducarToques();

    var minhas = await ConversaParticipante.findAll({ where: { utilizador_id: req.utilizador.id } });
    var meusIds = minhas.map(function (p) { return p.conversa_id; });

    var geral = await Conversa.findOne({
      where: { organizacao_id: req.utilizador.organizacao_id, tipo: "geral" },
    });
    if (geral && meusIds.indexOf(geral.id) === -1) meusIds.push(geral.id);

    if (meusIds.length === 0) return res.status(200).json({ dados: [] });

    var lista = await Chamada.findAll({
      where: {
        conversa_id: { [Op.in]: meusIds },
        estado: "a_tocar",
        iniciador_id: { [Op.ne]: req.utilizador.id },
      },
      order: [["createdAt", "DESC"]],
      include: [
        iniciarInclude(),
        { model: Conversa, as: "conversa", attributes: ["id", "tipo", "titulo"] },
      ],
    });

    var saida = [];
    for (var i = 0; i < lista.length; i++) {
      var chamada = lista[i];
      // Quem recusou o toque nao torna a ve-lo.
      if (parseLista(chamada.recusados).indexOf(String(req.utilizador.id)) !== -1) continue;
      var conversa = chamada.conversa;
      saida.push({
        id: chamada.id,
        conversa_id: chamada.conversa_id,
        conversa_titulo: conversa ? (conversa.tipo === "geral" ? "Geral" : (conversa.titulo || null)) : null,
        conversa_tipo: conversa ? conversa.tipo : null,
        tipo: chamada.tipo,
        estado: chamada.estado,
        iniciador: chamada.iniciador,
      });
    }

    return res.status(200).json({ dados: saida });
  } catch (e) {
    console.log("Erro ao listar chamadas pendentes:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// POST /api/chat/chamadas/:id/aceitar - aceita (se ainda a tocar) ou junta-se
// a uma chamada ja em curso.
var aceitarChamada = async function (req, res) {
  try {
    var carregada = await carregarMinhaChamada(req);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    var chamada = carregada.chamada;

    if (["a_tocar", "aceite"].indexOf(chamada.estado) === -1) {
      return res.status(409).json({ error: "A chamada ja nao esta disponivel" });
    }

    var aceites = parseLista(chamada.aceites);
    var euId = String(req.utilizador.id);
    if (aceites.indexOf(euId) === -1) aceites.push(euId);
    chamada.aceites = JSON.stringify(aceites);

    var saiu = parseLista(chamada.saiu).filter(function (id) { return id !== euId; });
    chamada.saiu = JSON.stringify(saiu);

    // Aceitar tambem retira a pessoa da lista de quem recusou o toque.
    var recusados = parseLista(chamada.recusados).filter(function (id) { return id !== euId; });
    chamada.recusados = JSON.stringify(recusados);

    if (chamada.estado === "a_tocar") chamada.estado = "aceite";
    await chamada.save();

    return res.status(200).json({
      dados: { id: chamada.id, estado: chamada.estado, vivos: vivosDaChamada(chamada) },
    });
  } catch (e) {
    console.log("Erro ao aceitar chamada:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// POST /api/chat/chamadas/:id/recusar
// Numa conversa directa a recusa termina a chamada. Em grupo ou no geral,
// cada pessoa pode recusar por si: o toque so acaba para todos quando
// ninguem aceita (ou quando o tempo do toque esgota).
var recusarChamada = async function (req, res) {
  try {
    var carregada = await carregarMinhaChamada(req);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    var chamada = carregada.chamada;

    if (chamada.estado !== "a_tocar") {
      return res.status(409).json({ error: "A chamada ja nao esta a tocar" });
    }

    var euId = String(req.utilizador.id);
    var recusados = parseLista(chamada.recusados);
    if (recusados.indexOf(euId) === -1) recusados.push(euId);
    chamada.recusados = JSON.stringify(recusados);

    var soOInicador = vivosDaChamada(chamada).filter(function (id) {
      return recusados.indexOf(id) === -1;
    });
    var ninguemMaisAceita = soOInicador.length === 1 && soOInicador[0] === String(chamada.iniciador_id);
    if (ninguemMaisAceita) {
      chamada.estado = "recusada";
      chamada.terminada_por = req.utilizador.id;
    }
    await chamada.save();

    return res.status(200).json({ dados: { id: chamada.id, estado: chamada.estado } });
  } catch (e) {
    console.log("Erro ao recusar chamada:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// POST /api/chat/chamadas/:id/terminar - em chamada, cada um sai por si; a
// chamada so termina para todos quando fica ninguem vivo.
var terminarChamada = async function (req, res) {
  try {
    var carregada = await carregarMinhaChamada(req);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });
    var chamada = carregada.chamada;
    var euId = String(req.utilizador.id);

    if (chamada.estado === "a_tocar") {
      chamada.estado = String(chamada.iniciador_id) === euId ? "sem_resposta" : "recusada";
      chamada.terminada_por = req.utilizador.id;
    } else if (chamada.estado === "aceite") {
      var saiu = parseLista(chamada.saiu);
      if (saiu.indexOf(euId) === -1) saiu.push(euId);
      chamada.saiu = JSON.stringify(saiu);
      var vivos = vivosDaChamada(chamada);
      if (vivos.length === 0) {
        chamada.estado = "terminada";
        chamada.terminada_por = req.utilizador.id;
      }
    } else {
      return res.status(409).json({ error: "A chamada ja terminou" });
    }

    await chamada.save();

    return res.status(200).json({ dados: { id: chamada.id, estado: chamada.estado, vivos: vivosDaChamada(chamada) } });
  } catch (e) {
    console.log("Erro ao terminar chamada:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// POST /api/chat/chamadas/:id/sinais  { tipo, corpo, destinatario_id? }
// Sem destinatario o sinal vai para todos os outros; com destinatario so
// esse participante o recebe (cada par WebRTC trata-se por si).
var adicionarSinal = async function (req, res) {
  try {
    var carregada = await carregarMinhaChamada(req);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });

    var tipo = req.body && req.body.tipo;
    var corpo = req.body && req.body.corpo ? String(req.body.corpo) : "";
    var destinatario = req.body && req.body.destinatario_id ? String(req.body.destinatario_id) : null;
    if (["offer", "answer", "ice"].indexOf(tipo) === -1) {
      return res.status(400).json({ error: "Tipo de sinal invalido" });
    }
    if (!corpo || corpo.length > MAX_CORPO_SINAL) {
      return res.status(400).json({ error: "Corpo do sinal invalido" });
    }

    var sinal = await ChamadaSinal.create({
      chamada_id: carregada.chamada.id,
      remetente_id: req.utilizador.id,
      destinatario_id: destinatario,
      tipo: tipo,
      corpo: corpo,
    });

    return res.status(201).json({ dados: { id: sinal.id } });
  } catch (e) {
    console.log("Erro ao guardar sinal:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// GET /api/chat/chamadas/:id/sinais - sinais enviados pelos outros para mim
// (diretos ou para todos).
var listarSinais = async function (req, res) {
  try {
    var carregada = await carregarMinhaChamada(req);
    if (carregada.erro) return res.status(carregada.erro.status).json({ error: carregada.erro.mensagem });

    var sinais = await ChamadaSinal.findAll({
      where: {
        chamada_id: carregada.chamada.id,
        remetente_id: { [Op.ne]: req.utilizador.id },
        [Op.or]: [
          { destinatario_id: null },
          { destinatario_id: req.utilizador.id },
        ],
      },
      order: [["createdAt", "ASC"]],
    });

    return res.status(200).json({
      dados: sinais.map(function (s) {
        return {
          id: s.id,
          remetente_id: String(s.remetente_id),
          tipo: s.tipo,
          corpo: s.corpo,
          createdAt: s.createdAt,
        };
      }),
    });
  } catch (e) {
    console.log("Erro ao listar sinais:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { criarChamada, obterChamada, pendentes, aceitarChamada, recusarChamada, terminarChamada, adicionarSinal, listarSinais };
