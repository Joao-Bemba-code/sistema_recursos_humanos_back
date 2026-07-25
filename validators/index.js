var { body, query, param, validationResult } = require("express-validator");

var handleErrors = function (req, res, next) {
  var errors = validationResult(req);
  if (!errors.isEmpty()) {
    var messages = errors.array().map(function (e) { return e.msg; });
    return res.status(400).json({
      error: "Erro de validação",
      detalhes: messages,
    });
  }
  next();
};

var authValidation = [
  body("email")
    .optional()
    .isEmail().withMessage("Email inválido")
    .normalizeEmail(),
  body("username")
    .optional()
    .isLength({ min: 3, max: 50 }).withMessage("Username deve ter entre 3 e 50 caracteres")
    .trim()
    .escape(),
  body("password")
    .notEmpty().withMessage("Password é obrigatória"),
  body("nome_completo")
    .optional()
    .isLength({ min: 3, max: 200 }).withMessage("Nome completo obrigatório")
    .trim()
    .escape(),
  handleErrors,
];

var collaboratorValidation = [
  body("nome_completo")
    .notEmpty().withMessage("Nome completo é obrigatório")
    .isLength({ min: 3, max: 200 }).withMessage("Nome deve ter entre 3 e 200 caracteres")
    .trim()
    .escape(),
  body("data_admissao")
    .notEmpty().withMessage("Data de admissão é obrigatória")
    .isISO8601().withMessage("Data de admissão inválida"),
  body("email_pessoal")
    .optional()
    .isEmail().withMessage("Email pessoal inválido")
    .normalizeEmail(),
  body("nif")
    .optional()
    .isLength({ min: 9, max: 20 }).withMessage("NIF inválido"),
  body("telefone")
    .optional()
    .isLength({ min: 9, max: 20 }).withMessage("Telefone inválido"),
  handleErrors,
];

var contractValidation = [
  body("colaborador_id")
    .notEmpty().withMessage("Colaborador é obrigatório")
    .isUUID().withMessage("ID do colaborador inválido"),
  body("tipo")
    .isIn(["Determinado", "Indeterminado", "Prestacao_Servicos", "Estagio", "Temporario"])
    .withMessage("Tipo de contrato inválido"),
  body("data_inicio")
    .notEmpty().withMessage("Data de início é obrigatória")
    .isISO8601().withMessage("Data de início inválida"),
  body("salario_base")
    .notEmpty().withMessage("Salário base é obrigatório")
    .isFloat({ min: 0 }).withMessage("Salário base deve ser positivo"),
  handleErrors,
];

var organizationValidation = [
  body("nome")
    .notEmpty().withMessage("Nome da organização é obrigatório")
    .isLength({ min: 2, max: 200 }).withMessage("Nome deve ter entre 2 e 200 caracteres")
    .trim()
    .escape(),
  body("nif")
    .optional()
    .isLength({ min: 9, max: 20 }).withMessage("NIF inválido"),
  body("email")
    .optional()
    .isEmail().withMessage("Email inválido")
    .normalizeEmail(),
  handleErrors,
];

var paginationValidation = [
  query("page")
    .optional()
    .isInt({ min: 1 }).withMessage("Página deve ser um número positivo"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 10000 }).withMessage("Limite deve ser entre 1 e 10000"),
  query("search")
    .optional()
    .isLength({ max: 200 }).withMessage("Busca muito longa")
    .trim()
    .escape(),
  handleErrors,
];

module.exports = {
  handleErrors,
  authValidation,
  collaboratorValidation,
  contractValidation,
  organizationValidation,
  paginationValidation,
};
