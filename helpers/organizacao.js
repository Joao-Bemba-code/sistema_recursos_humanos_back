var { Colaborador } = require("../models");

// ==================== ISOLAMENTO ENTRE ORGANIZACOES ====================
// Varias tabelas antigas (contratos, ferias, creditos, formacao, presencas)
// nao guardam organizacao_id: a que pertencem e sempre a do colaborador.
// Estes helpers obrigam a filtrar por essa organizacao, para que nenhuma
// conta consiga ler ou alterar registos de outra organizacao pelo id.

var ORG_INEXISTENTE = "00000000-0000-0000-0000-000000000000";

var orgDaSessao = function (req) {
  return req && req.utilizador ? req.utilizador.organizacao_id : null;
};

// Include pronto a usar nas listagens: exige que o colaborador seja da
// organizacao da sessao. Sem organizacao o include nunca encontra nada.
var incluirColaboradorDaOrg = function (orgId, attributes) {
  return {
    model: Colaborador,
    as: "colaborador",
    attributes: attributes || ["id", "nome_completo", "numero_colaborador"],
    where: { organizacao_id: orgId || ORG_INEXISTENTE },
    required: true,
  };
};

// Confirma que o colaborador pertence a organizacao indicada.
var colaboradorNaOrg = async function (colaboradorId, orgId) {
  if (!colaboradorId || !orgId) return false;
  var encontrado = await Colaborador.findOne({
    where: { id: colaboradorId, organizacao_id: orgId },
    attributes: ["id"],
  });
  return !!encontrado;
};

module.exports = { ORG_INEXISTENTE, orgDaSessao, incluirColaboradorDaOrg, colaboradorNaOrg };
