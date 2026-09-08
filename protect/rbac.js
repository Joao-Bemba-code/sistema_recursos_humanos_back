var normalizarPermissoes = function (perm) {
  if (!perm) return {};
  if (typeof perm === "string") {
    try {
      return JSON.parse(perm);
    } catch (e) {
      return {};
    }
  }
  return perm;
};

// Perfis efetivos de um utilizador (perfil principal + perfis adicionais)
var perfisUtilizador = function (utilizador) {
  var perfis = [];
  if (!utilizador) return perfis;
  if (utilizador.perfil) perfis.push(utilizador.perfil);
  (utilizador.perfis_extra || []).forEach(function (p) {
    if (p && !perfis.some(function (x) { return x.id === p.id; })) perfis.push(p);
  });
  return perfis;
};

// Soma as permissoes e o nivel maximo entre todos os perfis
var fundirPermissoes = function (perfis) {
  var merged = {};
  var nivel = 0;
  perfis.forEach(function (p) {
    if (!p) return;
    if ((p.nivel || 0) > nivel) nivel = p.nivel;
    var perm = normalizarPermissoes(p.permissoes);
    Object.keys(perm).forEach(function (mod) {
      var ops = Array.isArray(perm[mod]) ? perm[mod] : [];
      var existentes = merged[mod] || [];
      ops.forEach(function (op) {
        if (existentes.indexOf(op) === -1) existentes.push(op);
      });
      merged[mod] = existentes;
    });
  });
  return { permissoes: merged, nivel: nivel };
};

// Prepara o utilizador com o conjunto efetivo de perfis e permissoes fundidas
var prepararUtilizador = function (utilizador) {
  if (!utilizador) return utilizador;
  var perfis = perfisUtilizador(utilizador);
  var fundido = fundirPermissoes(perfis);
  if (utilizador.perfil) {
    utilizador.perfil.permissoes = fundido.permissoes;
    utilizador.perfil.nivel = fundido.nivel;
  }
  utilizador.perfis = perfis;
  utilizador.multiPerfil = perfis.length > 1;
  return utilizador;
};

var requireRole = function () {
  var roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.utilizador) {
      return res.status(403).json({ error: "Perfil não encontrado" });
    }

    var rolesLower = roles.map(function (r) { return r.toLowerCase(); });

    var perfis = perfisUtilizador(req.utilizador);
    var temPerfil = perfis.some(function (p) {
      return p && rolesLower.indexOf(String(p.nome).toLowerCase()) !== -1;
    });
    if (temPerfil) {
      return next();
    }

    var nivelMaximo = perfis.reduce(function (max, p) {
      return Math.max(max, (p && p.nivel) || 0);
    }, 0);
    if (nivelMaximo >= 4) {
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
    if (!req.utilizador) {
      return res.status(403).json({ error: "Perfil não encontrado" });
    }

    var perfis = perfisUtilizador(req.utilizador);
    var nivelMaximo = perfis.reduce(function (max, p) {
      return Math.max(max, (p && p.nivel) || 0);
    }, 0);

    if (nivelMaximo >= minLevel || nivelMaximo >= 4) {
      return next();
    }

    return res.status(403).json({
      error: "Nível de permissão insuficiente",
      nivel_necessario: minLevel,
      nivel_actual: nivelMaximo,
    });
  };
};

var requirePermission = function (modulo, operacao) {
  return function (req, res, next) {
    if (!req.utilizador) {
      return res.status(403).json({ error: "Perfil não encontrado" });
    }

    var perfis = perfisUtilizador(req.utilizador);
    var fundido = fundirPermissoes(perfis);

    if (fundido.nivel >= 4) {
      return next();
    }

    if (fundido.permissoes[modulo] && fundido.permissoes[modulo].indexOf(operacao) !== -1) {
      return next();
    }

    return res.status(403).json({
      error: "Sem permissão para esta operação",
      modulo: modulo,
      operacao: operacao,
    });
  };
};

module.exports = { requireRole, requireLevel, requirePermission, normalizarPermissoes, perfisUtilizador, fundirPermissoes, prepararUtilizador };
