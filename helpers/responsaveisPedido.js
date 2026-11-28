var { Op } = require("sequelize");
var { sequelize } = require("../config");
var { Utilizador, Unidade, UnidadeSeccao, Seccao, SeccaoMembro, Departamento } = require("../models");

// Comparacao tolerante a acentos, maiusculas e sufixos como "(Chefe de Seccao)".
function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@._\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Resolve os responsaveis (supervisores) do collaborador a partir da estrutura
// organizacional ja existente, sem exigir colunas novas na base de dados.
// O nome definido em responsavel_nome e correspondido com utilizadores da
// mesma organizacao pelo nome completo ou pelo email.
async function obterIdsResponsaveis(colaborador, organizacaoId) {
  if (!colaborador || !organizacaoId) return [];

  var nomes = [];
  function adicionar(valor) {
    var texto = String(valor || "").trim();
    if (texto && nomes.indexOf(texto) === -1) nomes.push(texto);
  }

  var seccaoIds = [];
  function adicionarSeccao(id) {
    if (id && seccaoIds.indexOf(id) === -1) seccaoIds.push(id);
  }

  // A coluna departamento_id existe na BD mas nao esta declarada no modelo
  // Sequelize. Ler directamente evita alterar o esquema e cobre os
  // colaboradores que nao pertencem a nenhuma seccao ou unidade.
  var linhas = await sequelize.query(
    "SELECT departamento_id FROM colaboradores WHERE id = ? LIMIT 1",
    { replacements: [colaborador.id], type: sequelize.QueryTypes.SELECT }
  );
  if (linhas.length > 0 && linhas[0].departamento_id) {
    var departamentoDirecto = await Departamento.findOne({
      where: { id: linhas[0].departamento_id, organizacao_id: organizacaoId },
    });
    if (departamentoDirecto) adicionar(departamentoDirecto.responsavel_nome);
  }

  if (colaborador.unidade_id) {
    var unidade = await Unidade.findOne({
      where: { id: colaborador.unidade_id, organizacao_id: organizacaoId },
    });
    if (unidade) adicionar(unidade.responsavel_nome);

    var vinculos = await UnidadeSeccao.findAll({
      where: { unidade_id: colaborador.unidade_id },
    });
    vinculos.forEach(function (vinculo) { adicionarSeccao(vinculo.seccao_id); });
  }

  var membros = await SeccaoMembro.findAll({
    where: { colaborador_id: colaborador.id },
  });
  membros.forEach(function (membro) { adicionarSeccao(membro.seccao_id); });

  var seccoes = seccaoIds.length > 0
    ? await Seccao.findAll({ where: { id: { [Op.in]: seccaoIds } } })
    : [];

  var departamentoIds = [];
  seccoes.forEach(function (seccao) {
    adicionar(seccao.responsavel_nome);
    if (seccao.departamento_id && departamentoIds.indexOf(seccao.departamento_id) === -1) {
      departamentoIds.push(seccao.departamento_id);
    }
  });

  var departamentos = departamentoIds.length > 0
    ? await Departamento.findAll({ where: { id: { [Op.in]: departamentoIds } } })
    : [];
  departamentos.forEach(function (departamento) { adicionar(departamento.responsavel_nome); });

  // Unidade de negocio tambem pode identificar a equipa do colaborador.
  if (colaborador.unidade_negocio) {
    var unidadeNegocio = await Unidade.findOne({
      where: { organizacao_id: organizacaoId, nome: colaborador.unidade_negocio },
    });
    if (unidadeNegocio) adicionar(unidadeNegocio.responsavel_nome);

    var departamentoNegocio = await Departamento.findOne({
      where: { organizacao_id: organizacaoId, nome: colaborador.unidade_negocio },
    });
    if (departamentoNegocio) adicionar(departamentoNegocio.responsavel_nome);
  }

  var alvos = nomes.map(normalizar).filter(Boolean);
  if (alvos.length === 0) return [];

  var utilizadores = await Utilizador.findAll({
    where: { organizacao_id: organizacaoId },
    attributes: ["id", "nome_completo", "email"],
  });

  return utilizadores.filter(function (utilizador) {
    var nome = normalizar(utilizador.nome_completo);
    var email = normalizar(utilizador.email);
    return alvos.some(function (alvo) {
      return (nome && (alvo === nome || alvo.indexOf(nome) !== -1)) ||
        (email && alvo === email);
    });
  }).map(function (utilizador) { return utilizador.id; });
}

module.exports = { obterIdsResponsaveis, normalizar };
