var { LogAuditoria } = require("../models");

// Registo central de atividades. Tudo o que e escrito aqui alimenta o feed
// /api/atividades: o RH/admin ve a descricao completa e o colaborador ve apenas
// a descricao publica (sem dados brutos, IPs ou user-agents).
var registarAtividade = async function (opcoes) {
  opcoes = opcoes || {};
  var req = opcoes.req || {};
  var utilizador = req.utilizador || null;

  try {
    await LogAuditoria.create({
      utilizador_id: utilizador ? utilizador.id : null,
      accao: opcoes.accao || "acesso",
      modulo: opcoes.modulo || "sistema",
      entidade: opcoes.entidade || null,
      entidade_id: opcoes.entidadeId || null,
      dados_depois: opcoes.dadosDepois || null,
      ip_address: req.ip || (req.connection ? req.connection.remoteAddress : null),
      user_agent: req.headers && req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 500) : null,
      descricao: opcoes.descricao || opcoes.descricaoPublica || null,
      descricao_publica: opcoes.descricaoPublica || null,
      organizacao_id: opcoes.organizacaoId || req.organizacao_id || null,
      colaborador_id: opcoes.colaboradorId || null,
      visivel_colaborador: opcoes.visivelColaborador !== false,
    });
  } catch (e) {
    // A auditoria nunca pode impedir a operacao principal.
    console.log("Aviso: nao foi possivel registar atividade:", e.message);
  }
};

module.exports = { registarAtividade };
