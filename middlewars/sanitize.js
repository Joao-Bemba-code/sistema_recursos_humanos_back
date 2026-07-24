var deepSanitize = function (obj) {
  if (typeof obj === "string") {
    return obj
      .replace(/<[^>]*>/g, "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;")
      .trim();
  }
  if (Array.isArray(obj)) {
    return obj.map(function (item) { return deepSanitize(item); });
  }
  if (obj && typeof obj === "object") {
    var sanitized = {};
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      if (key.indexOf("$") === 0 || key.indexOf("_") === 0) {
        continue;
      }
      sanitized[key] = deepSanitize(obj[key]);
    }
    return sanitized;
  }
  return obj;
};

var stripHtml = function (str) {
  if (typeof str !== "string") return str;
  return str.replace(/<[^>]*>/g, "").trim();
};

var normalizeEmail = function (email) {
  if (typeof email !== "string") return email;
  return email.toLowerCase().trim();
};

var normalizePhone = function (phone) {
  if (typeof phone !== "string") return phone;
  return phone.replace(/[\s\-\(\)]/g, "").trim();
};

module.exports = { deepSanitize, stripHtml, normalizeEmail, normalizePhone };
