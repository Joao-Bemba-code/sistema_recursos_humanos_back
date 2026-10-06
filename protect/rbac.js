var MODULOS_SISTEMA = [
  { chave: "colaboradores", nome: "Colaboradores" },
  { chave: "contratos", nome: "Contratos" },
  { chave: "departamentos", nome: "Departamentos" },
  { chave: "assiduidade", nome: "Assiduidade" },
  { chave: "faltas", nome: "Faltas e Atrasos" },
  { chave: "ferias", nome: "Férias" },
  { chave: "avaliacao", nome: "Avaliação" },
  { chave: "formacao", nome: "Formação" },
  { chave: "folha_salarial", nome: "Folha Salarial" },
  { chave: "pedidos", nome: "Pedidos" },
  { chave: "advertencias", nome: "Advertências" },
  { chave: "utilizadores", nome: "Utilizadores" },
  { chave: "relatorios", nome: "Relatórios" },
  { chave: "configuracoes", nome: "Configurações" },
  { chave: "portal", nome: "Portal" },
  { chave: "comunicados", nome: "Comunicados" },
  { chave: "tarefas", nome: "Gestão de Tarefas" },
  // NOTA: "creditos" fica de fora de propósito — o módulo é exclusivo do
  // Administrador (nível 4) e não é gerido pela matriz de permissões.
];

var normalizarPermissoes = function (perm) {
  if (!perm) return {};
  var p = perm;
  var tentativas = 0;
  while (typeof p === "string" && tentativas < 3) {
    try {
      p = JSON.parse(p);
    } catch (e) {
      return {};
    }
    tentativas++;
  }
  if (p && typeof p === "object" && !Array.isArray(p)) return p;
  return {};
};

// Normaliza as permissoes de um perfil para o formato actual do sistema:
// - descarta chaves antigas/desconhecidas (licencas, comunicacao, _all, ...);
// - qualquer operacao concedida implica "read" (sem ler nada funciona).
// A chave antiga "_all" NAO e expandida: quem nao tem o modulo marcado
// explicitamente na matriz nao tem acesso (fail-closed).
var normalizarPermissoesSistema = function (perm) {
  var p = normalizarPermissoes(perm);
  var conhecidas = {};
  MODULOS_SISTEMA.forEach(function (m) { conhecidas[m.chave] = true; });

  var out = {};
  Object.keys(p).forEach(function (k) {
    if (!conhecidas[k]) return;
    out[k] = Array.isArray(p[k]) ? p[k].slice() : [];
  });

  Object.keys(out).forEach(function (mod) {
    var ops = out[mod];
    if (ops.length > 0 && ops.indexOf("read") === -1) ops.push("read");
  });

  return out;
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
    var perm = normalizarPermissoesSistema(p.permissoes);
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

// Acesso baseado em módulo: passa apenas com permissão explícita no
// módulo/operação ou se o utilizador for administrador (nível 4).
var requireModulo = function (modulo, operacao) {
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

// Igual ao requireModulo mas passa TAMBÉM pelos perfis indicados pelo nome
// (compatibilidade com os perfis clássicos do sistema). Ou seja: a permissão
// dada na matriz funciona E os perfis históricos continuam a funcionar.
var requireModuloOuRole = function (modulo, operacao) {
  var roles = Array.prototype.slice.call(arguments, 2);
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

    var rolesLower = roles.map(function (r) { return r.toLowerCase(); });
    var temPerfil = perfis.some(function (p) {
      return p && rolesLower.indexOf(String(p.nome).toLowerCase()) !== -1;
    });
    if (temPerfil) {
      return next();
    }

    return res.status(403).json({
      error: "Sem permissão para esta operação",
      modulo: modulo,
      operacao: operacao,
      roles_necessarios: roles,
    });
  };
};

module.exports = {
  MODULOS_SISTEMA,
  requireRole,
  requireLevel,
  requirePermission,
  requireModulo,
  requireModuloOuRole,
  normalizarPermissoes,
  normalizarPermissoesSistema,
  perfisUtilizador,
  fundirPermissoes,
  prepararUtilizador,
};
