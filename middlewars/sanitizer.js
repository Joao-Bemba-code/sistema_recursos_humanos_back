var sanitize = require("./sanitize");

var sanitizeBody = function (req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitize.deepSanitize(req.body);
  }
  if (req.query && typeof req.query === "object") {
    req.query = sanitize.deepSanitize(req.query);
  }
  if (req.params && typeof req.params === "object") {
    req.params = sanitize.deepSanitize(req.params);
  }
  next();
};

module.exports = { sanitizeBody };
