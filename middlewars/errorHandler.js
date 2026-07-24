var errorHandler = function (err, req, res, next) {
  console.log("=== ERRO ===");
  console.log("Mensagem:", err.message);
  console.log("Stack:", err.stack);
  console.log("Rota:", req.method, req.url);

  if (err.name === "SequelizeValidationError") {
    var messages = err.errors.map(function (e) { return e.message; });
    return res.status(400).json({
      error: "Erro de validação",
      detalhes: messages,
    });
  }

  if (err.name === "SequelizeUniqueConstraintError") {
    var fields = err.errors.map(function (e) { return e.path; });
    return res.status(409).json({
      error: "Registro já existe",
      campos: fields,
    });
  }

  if (err.name === "SequelizeForeignKeyConstraintError") {
    return res.status(400).json({
      error: "Referência inválida. Verifique os dados dependentes.",
    });
  }

  if (err.name === "SequelizeDatabaseError") {
    return res.status(500).json({
      error: "Erro de base de dados",
    });
  }

  if (err.name === "SyntaxError" && err.status === 400 && "body" in err) {
    return res.status(400).json({
      error: "JSON mal formatado",
    });
  }

  var statusCode = err.statusCode || err.status || 500;
  var message = statusCode === 500
    ? "Erro interno do servidor"
    : err.message;

  return res.status(statusCode).json({
    error: message,
  });
};

module.exports = errorHandler;
