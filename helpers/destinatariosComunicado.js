var { Op } = require("sequelize");
var { Utilizador, Colaborador } = require("../models");
var { colaboradoresDaUnidade, colaboradoresDoDepartamento } = require("./vinculos");

function linkDoComunicado(id) {
  return "/dashboard/comunicados?comunicado=" + String(id);
}

// Devolve os utilizadores que, segundo a visibilidade do comunicado, podem
// vê-lo. Usa as mesmas regras da listagem para que a notificacao nunca chegue
// a quem nao tem acesso ao comunicado.
async function obterIdsDestinatarios(aviso, organizacaoId) {
  if (!aviso || !organizacaoId) return [];
  if (!aviso.publicado) return [];

  var agora = new Date();
  if (aviso.data_inicio && new Date(aviso.data_inicio) > agora) return [];
  if (aviso.data_fim && new Date(aviso.data_fim) < agora) return [];

  var visivelPara = aviso.visivel_para || "Todos";
  var semAlvo = !aviso.departamento_id && !aviso.cargo_id && !aviso.colaborador_id && !aviso.unidade_id;

  // Comunicados gerais (ou com destino em falta) chegam a todos os
  // utilizadores da organizacao, incluindo gestores sem registo de
  // colaborador.
  if (visivelPara === "Todos" || semAlvo) {
    var todos = await Utilizador.findAll({
      where: { organizacao_id: organizacaoId },
      attributes: ["id"],
    });
    return todos.map(function (u) { return u.id; });
  }

  var idsColaboradores = [];

  if (visivelPara === "Perfil") {
    var colabDirecto = await Colaborador.findByPk(aviso.colaborador_id, {
      attributes: ["utilizador_id", "organizacao_id"],
    });
    return colabDirecto && colabDirecto.utilizador_id &&
      colabDirecto.organizacao_id === organizacaoId
      ? [colabDirecto.utilizador_id]
      : [];
  }

  if (visivelPara === "Cargo") {
    var doCargo = await Colaborador.findAll({
      where: { organizacao_id: organizacaoId, cargo_id: aviso.cargo_id },
      attributes: ["utilizador_id"],
    });
    return doCargo.map(function (c) { return c.utilizador_id; }).filter(Boolean);
  }

  if (visivelPara === "Unidade") {
    idsColaboradores = await colaboradoresDaUnidade(aviso.unidade_id, organizacaoId);
  } else if (visivelPara === "Departamento") {
    idsColaboradores = await colaboradoresDoDepartamento(aviso.departamento_id, organizacaoId);
  }

  if (!idsColaboradores.length) return [];

  var colaboradores = await Colaborador.findAll({
    where: { id: { [Op.in]: idsColaboradores } },
    attributes: ["utilizador_id"],
  });
  return colaboradores.map(function (c) { return c.utilizador_id; }).filter(Boolean);
}

module.exports = { obterIdsDestinatarios, linkDoComunicado };
