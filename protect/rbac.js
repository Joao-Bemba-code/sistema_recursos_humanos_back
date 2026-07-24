var requireRole = function () {
  var roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.utilizador || !req.utilizador.perfil) {
      return res.status(403).json({ error: "Perfil não encontrado" });
    }

    var perfilNome = req.utilizador.perfil.nome.toLowerCase();
    var nivelPerfil = req.utilizador.perfil.nivel;

    var rolesLower = roles.map(function (r) { return r.toLowerCase(); });

    if (rolesLower.indexOf(perfilNome) !== -1) {
      return next();
    }

    if (nivelPerfil >= 4) {
      return next();
    }

    return res.status(403).json({
      error: "Sem permissão para esta operação",
      roles_necessarios: roles,
    });
  };
};

var requireLevel = function (minLevel) {
  return function (req, res, next) {
    if (!req.utilizador || !req.utilizador.perfil) {
      return res.status(403).json({ error: "Perfil não encontrado" });
    }

    if (req.utilizador.perfil.nivel >= minLevel || req.utilizador.perfil.nivel >= 4) {
      return next();
    }

    return res.status(403).json({
      error: "Nível de permissão insuficiente",
      nivel_necessario: minLevel,
      nivel_actual: req.utilizador.perfil.nivel,
    });
  };
};

var requirePermission = function (modulo, operacao) {
  return function (req, res, next) {
    if (!req.utilizador || !req.utilizador.perfil) {
      return res.status(403).json({ error: "Perfil não encontrado" });
    }

    if (req.utilizador.perfil.nivel >= 4) {
      return next();
    }

    var permissoes = req.utilizador.perfil.permissoes || {};
    if (permissoes[modulo] && permissoes[modulo].indexOf(operacao) !== -1) {
      return next();
    }

    return res.status(403).json({
      error: "Sem permissão para esta operação",
      modulo: modulo,
      operacao: operacao,
    });
  };
};

module.exports = { requireRole, requireLevel, requirePermission };
