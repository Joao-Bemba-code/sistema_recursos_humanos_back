var { Op } = require("sequelize");
var { Colaborador, Seccao, SeccaoMembro, Unidade, UnidadeSeccao } = require("../models");
var { ORG_INEXISTENTE } = require("./organizacao");

// Um colaborador pode estar ligado a uma unidade ou a um departamento por
// varias vias: pela coluna directa (registos antigos), pela seccao em que
// esta inscrito e, no caso da unidade, pelas seccoes a que a unidade esta
// vinculada. Estes utilitarios juntam essas vias para que os filtros e as
// accoes mostrem sempre as mesmas pessoas: as vinculadas, e nao apenas as
// que ficaram gravadas na coluna directa.

var juntar = function (destino, ids) {
  (ids || []).forEach(function (id) {
    if (id && destino.indexOf(id) === -1) destino.push(id);
  });
  return destino;
};

// Seccoes de um departamento dentro da organizacao.
var seccoesDoDepartamento = async function (departamentoId, organizacaoId) {
  if (!departamentoId) return [];
  var seccoes = await Seccao.findAll({
    where: { departamento_id: departamentoId, organizacao_id: organizacaoId || ORG_INEXISTENTE },
    attributes: ["id"],
  }).catch(function () { return []; });
  return seccoes.map(function (s) { return s.id; });
};

// Seccoes a que uma unidade esta vinculada.
var seccoesDaUnidade = async function (unidadeId, organizacaoId) {
  if (!unidadeId) return [];
  var ligacoes = await UnidadeSeccao.findAll({
    where: { unidade_id: unidadeId },
    attributes: ["seccao_id"],
  }).catch(function () { return []; });
  var ids = juntar([], ligacoes.map(function (l) { return l.seccao_id; }));
  if (!ids.length) return [];
  var seccoes = await Seccao.findAll({
    where: { id: { [Op.in]: ids }, organizacao_id: organizacaoId || ORG_INEXISTENTE },
    attributes: ["id"],
  }).catch(function () { return []; });
  return seccoes.map(function (s) { return s.id; });
};

// Unidades vinculadas a um departamento (por qualquer uma das suas seccoes).
var unidadesDoDepartamento = async function (departamentoId, organizacaoId) {
  var idsSeccoes = await seccoesDoDepartamento(departamentoId, organizacaoId);
  if (!idsSeccoes.length) return [];
  var ligacoes = await UnidadeSeccao.findAll({
    where: { seccao_id: { [Op.in]: idsSeccoes } },
    attributes: ["unidade_id"],
  }).catch(function () { return []; });
  return juntar([], ligacoes.map(function (l) { return l.unidade_id; }));
};

// Colaboradores inscritos nas seccoes indicadas.
var membrosDasSeccoes = async function (idsSeccoes) {
  if (!idsSeccoes || !idsSeccoes.length) return [];
  var membros = await SeccaoMembro.findAll({
    where: { seccao_id: { [Op.in]: idsSeccoes } },
    attributes: ["colaborador_id"],
  }).catch(function () { return []; });
  return juntar([], membros.map(function (m) { return m.colaborador_id; }));
};

// Pessoas de uma unidade: inscritas nas seccoes a que a unidade esta
// vinculada, mais as que foram associadas directamente a unidade.
var colaboradoresDaUnidade = async function (unidadeId, organizacaoId) {
  var org = organizacaoId || ORG_INEXISTENTE;
  var ids = await membrosDasSeccoes(await seccoesDaUnidade(unidadeId, org));
  var directos = await Colaborador.findAll({
    where: { organizacao_id: org, unidade_id: unidadeId },
    attributes: ["id"],
  }).catch(function () { return []; });
  return juntar(ids, directos.map(function (c) { return c.id; }));
};

// Pessoas de um departamento: inscritas nas seccoes do departamento, mais as
// que estao associadas a unidades vinculadas ao departamento ou que tem a
// coluna directa departamento_id preenchida.
var colaboradoresDoDepartamento = async function (departamentoId, organizacaoId) {
  var org = organizacaoId || ORG_INEXISTENTE;
  var ids = await membrosDasSeccoes(await seccoesDoDepartamento(departamentoId, org));
  var unidades = await unidadesDoDepartamento(departamentoId, org);
  var vias = [{ departamento_id: departamentoId }];
  if (unidades.length) vias.push({ unidade_id: { [Op.in]: unidades } });
  var directos = await Colaborador.findAll({
    where: { organizacao_id: org, [Op.or]: vias },
    attributes: ["id"],
  }).catch(function () { return []; });
  return juntar(ids, directos.map(function (c) { return c.id; }));
};

// Pessoas ainda sem unidade: sem coluna directa e sem seccao vinculada a
// qualquer unidade da organizacao.
var colaboradoresSemUnidade = async function (organizacaoId) {
  var org = organizacaoId || ORG_INEXISTENTE;
  var unidades = await Unidade.findAll({
    where: { organizacao_id: org },
    attributes: ["id"],
  }).catch(function () { return []; });
  var idsUnidades = unidades.map(function (u) { return u.id; });
  var idsSeccoes = [];
  if (idsUnidades.length) {
    var ligacoes = await UnidadeSeccao.findAll({
      where: { unidade_id: { [Op.in]: idsUnidades } },
      attributes: ["seccao_id"],
    }).catch(function () { return []; });
    idsSeccoes = juntar([], ligacoes.map(function (l) { return l.seccao_id; }));
  }
  var comUnidade = await membrosDasSeccoes(idsSeccoes);
  var todos = await Colaborador.findAll({
    where: { organizacao_id: org },
    attributes: ["id", "unidade_id"],
  }).catch(function () { return []; });
  return todos
    .filter(function (c) {
      return !c.unidade_id && comUnidade.indexOf(c.id) === -1;
    })
    .map(function (c) { return c.id; });
};

// Departamentos e unidades de um colaborador, juntando a coluna directa, as
// seccoes em que esta inscrito e as seccoes das suas unidades.
var vinculosDoColaborador = async function (colaboradorId, organizacaoId) {
  var org = organizacaoId || ORG_INEXISTENTE;
  var resultado = { departamentos: [], unidades: [] };
  if (!colaboradorId) return resultado;

  var colaborador = await Colaborador.findOne({
    where: { id: colaboradorId, organizacao_id: org },
    attributes: ["id", "departamento_id", "unidade_id"],
  }).catch(function () { return null; });
  if (!colaborador) return resultado;

  juntar(resultado.departamentos, [colaborador.departamento_id]);
  juntar(resultado.unidades, [colaborador.unidade_id]);

  var membros = await SeccaoMembro.findAll({
    where: { colaborador_id: colaboradorId },
    attributes: ["seccao_id"],
  }).catch(function () { return []; });
  var idsSeccoes = juntar([], membros.map(function (m) { return m.seccao_id; }));

  if (idsSeccoes.length) {
    var seccoes = await Seccao.findAll({
      where: { id: { [Op.in]: idsSeccoes }, organizacao_id: org },
      attributes: ["id", "departamento_id"],
    }).catch(function () { return []; });
    seccoes.forEach(function (s) {
      juntar(resultado.departamentos, [s.departamento_id]);
    });

    var ligacoes = await UnidadeSeccao.findAll({
      where: { seccao_id: { [Op.in]: idsSeccoes } },
      attributes: ["unidade_id"],
    }).catch(function () { return []; });
    juntar(resultado.unidades, ligacoes.map(function (l) { return l.unidade_id; }));
  }

  // Departamentos das unidades a que o colaborador pertence.
  if (resultado.unidades.length) {
    var ligacoesUnidade = await UnidadeSeccao.findAll({
      where: { unidade_id: { [Op.in]: resultado.unidades } },
      attributes: ["seccao_id"],
    }).catch(function () { return []; });
    var idsSeccoesUnidade = juntar([], ligacoesUnidade.map(function (l) { return l.seccao_id; }));
    if (idsSeccoesUnidade.length) {
      var seccoesUnidade = await Seccao.findAll({
        where: { id: { [Op.in]: idsSeccoesUnidade }, organizacao_id: org },
        attributes: ["id", "departamento_id"],
      }).catch(function () { return []; });
      seccoesUnidade.forEach(function (s) {
        juntar(resultado.departamentos, [s.departamento_id]);
      });
    }
  }

  return resultado;
};

module.exports = {
  seccoesDoDepartamento: seccoesDoDepartamento,
  seccoesDaUnidade: seccoesDaUnidade,
  membrosDasSeccoes: membrosDasSeccoes,
  unidadesDoDepartamento: unidadesDoDepartamento,
  colaboradoresDaUnidade: colaboradoresDaUnidade,
  colaboradoresDoDepartamento: colaboradoresDoDepartamento,
  colaboradoresSemUnidade: colaboradoresSemUnidade,
  vinculosDoColaborador: vinculosDoColaborador,
};
