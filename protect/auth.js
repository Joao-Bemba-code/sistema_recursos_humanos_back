var jwt = require("jsonwebtoken");
var { Utilizador, Perfil, Organizacao } = require("../models");
var { prepararUtilizador } = require("./rbac");

var authenticate = async (req, res, next) => {
  try {
    var header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token de autenticação necessário" });
    }

    var token = header.split(" ")[1];
    var decoded;
    try {
      decoded = jwt.verify(token, process.env.SECRET);
    } catch (e) {
      if (e.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Sessão expirada. Faça login novamente." });
      }
      return res.status(401).json({ error: "Token inválido" });
    }

    var utilizador = await Utilizador.findByPk(decoded.id, {
      include: [
        { model: Perfil, as: "perfil" },
        { model: Perfil, as: "perfis_extra" },
        { model: Organizacao, as: "organizacao" },
      ],
    });

    if (!utilizador) {
      return res.status(401).json({ error: "Utilizador não encontrado" });
    }

    if (!utilizador.activo) {
      return res.status(403).json({ error: "Conta desactivada. Contacte o administrador." });
    }

    if (utilizador.bloqueado) {
      return res.status(403).json({ error: "Conta bloqueada. Contacte o administrador." });
    }

    prepararUtilizador(utilizador);

    req.utilizador = utilizador;
    req.organizacao_id = utilizador.organizacao_id;
    next();
  } catch (e) {
    console.log("Erro no authenticate:", e.message);
    return res.status(500).json({ error: "Erro interno de autenticação" });
  }
};

var authenticateOptional = async (req, res, next) => {
  try {
    var header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      req.utilizador = null;
      return next();
    }
    var token = header.split(" ")[1];
    try {
      var decoded = jwt.verify(token, process.env.SECRET);
      var utilizador = await Utilizador.findByPk(decoded.id, {
        include: [
          { model: Perfil, as: "perfil" },
          { model: Perfil, as: "perfis_extra" },
          { model: Organizacao, as: "organizacao" },
        ],
      });
      if (utilizador) prepararUtilizador(utilizador);
      req.utilizador = utilizador || null;
      req.organizacao_id = utilizador ? utilizador.organizacao_id : null;
    } catch (e) {
      req.utilizador = null;
    }
    next();
  } catch (e) {
    req.utilizador = null;
    next();
  }
};

module.exports = { authenticate, authenticateOptional };
