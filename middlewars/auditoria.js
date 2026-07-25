var { LogAuditoria, Utilizador } = require("../models");

var auditoria = function (modulo, accao) {
  return async function (req, res, next) {
    var originalJson = res.json.bind(res);

    res.json = function (data) {
      (async function () {
        try {
          var registro = {
            utilizador_id: req.utilizador ? req.utilizador.id : null,
            accao: accao,
            modulo: modulo,
            ip_address: req.ip || (req.connection ? req.connection.remoteAddress : null),
            user_agent: req.headers ? req.headers["user-agent"] : null,
          };

          if (req.body) {
            registro.dados_depois = req.body;
          }

          if (req.params && req.params.id) {
            registro.entidade_id = req.params.id;
          }

          if (data && data.id) {
            registro.entidade_id = data.id;
          }

          await LogAuditoria.create(registro);
        } catch (e) {
          console.log("Erro ao registar auditoria:", e.message);
        }
      })();

      return originalJson(data);
    };

    next();
  };
};

module.exports = { auditoria };
