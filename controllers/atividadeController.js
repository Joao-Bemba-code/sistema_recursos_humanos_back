var { Op } = require("sequelize");
var { LogAuditoria, Colaborador, Utilizador } = require("../models");
var { fundirPermissoes, perfisUtilizador } = require("../protect/rbac");

var responderErro = function (res, e) {
  var status = e.status || 500;
  if (status >= 500) console.log("Erro ao listar atividades:", e.message);
  return res.status(status).json({ error: status >= 500 ? "Erro interno do servidor" : e.message });
};

var inteiroPositivo = function (valor, omissao, maximo) {
  var n = parseInt(valor, 10);
  if (!isFinite(n) || n < 1) return omissao;
  return Math.min(n, maximo);
};

var ehAdministrador = function (req) {
  if (!req.utilizador) return false;
  return fundirPermissoes(perfisUtilizador(req.utilizador)).nivel >= 4;
};

var textoSeguro = function (valor, limite) {
  if (!valor) return null;
  return String(valor).slice(0, limite);
};

// Feed unificado. O isolamento e feito no servidor: niveis >= 4 veem a
// organizacao inteira; qualquer outro utilizador so ve os eventos ligados ao
// seu colaborador (ou os que ele proprio praticou).
exports.list = async function (req, res) {
  try {
    if (!req.utilizador) return res.status(401).json({ error: "Autenticação necessária" });

    var limite = inteiroPositivo(req.query.limite || req.query.limit, 50, 100);
    var pagina = inteiroPositivo(req.query.pagina || req.query.page, 1, 100000);
    var where = {};

    if (req.organizacao_id) where.organizacao_id = req.organizacao_id;

    if (!ehAdministrador(req)) {
      var colab = await Colaborador.findOne({
        where: { utilizador_id: req.utilizador.id },
        attributes: ["id"],
      });
      var condicoes = [];
      if (colab) condicoes.push({ colaborador_id: colab.id });
      condicoes.push({ utilizador_id: req.utilizador.id });
      where[Op.or] = condicoes;
      where.visivel_colaborador = true;
    }

    if (req.query.modulo) where.modulo = textoSeguro(req.query.modulo, 50);
    if (req.query.accao) where.accao = textoSeguro(req.query.accao, 50);
    if (req.query.entidade) where.entidade = textoSeguro(req.query.entidade, 100);

    if (req.query.de && req.query.ate) {
      where.createdAt = { [Op.between]: [new Date(req.query.de), new Date(req.query.ate)] };
    } else if (req.query.de) {
      where.createdAt = { [Op.gte]: new Date(req.query.de) };
    } else if (req.query.ate) {
      where.createdAt = { [Op.lte]: new Date(req.query.ate) };
    }

    var resultado = await LogAuditoria.findAndCountAll({
      where: where,
      order: [["createdAt", "DESC"]],
      limit: limite,
      offset: (pagina - 1) * limite,
    });

    var ids = [];
    resultado.rows.forEach(function (linha) {
      if (linha.utilizador_id && ids.indexOf(linha.utilizador_id) === -1) ids.push(linha.utilizador_id);
    });
    var nomes = {};
    if (ids.length > 0) {
      var utilizadores = await Utilizador.findAll({
        where: { id: ids },
        attributes: ["id", "nome_completo", "username", "email"],
      });
      utilizadores.forEach(function (u) {
        nomes[u.id] = u.nome_completo || u.username || u.email || "Utilizador";
      });
    }

    var admin = ehAdministrador(req);
    var dados = resultado.rows.map(function (linha) {
      return {
        id: linha.id,
        accao: linha.accao,
        modulo: linha.modulo,
        entidade: linha.entidade || null,
        descricao: admin
          ? (linha.descricao || linha.descricao_publica || null)
          : (linha.descricao_publica || null),
        utilizador_id: linha.utilizador_id || null,
        utilizador_nome: linha.utilizador_id ? (nomes[linha.utilizador_id] || "Utilizador") : null,
        createdAt: linha.createdAt,
      };
    });

    return res.status(200).json({
      dados: dados,
      total: resultado.count,
      pagina: pagina,
      limite: limite,
    });
  } catch (e) {
    return responderErro(res, e);
  }
};
