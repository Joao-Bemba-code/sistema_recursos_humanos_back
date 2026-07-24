var { DataTypes } = require("sequelize");
var bcrypt = require("bcryptjs");
var { sequelize } = require("../config");

var Utilizador = sequelize.define("Utilizador", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  nome_completo: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: false,
    unique: true,
    validate: { isEmail: true },
  },
  username: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  telefone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  fotografia: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  ultimo_login: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  must_change_password: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  bloqueado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  tentativas_login: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  token_reset: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  token_reset_expira: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: "utilizadores",
  timestamps: true,
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        var salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed("password") && user.password) {
        var salt = await bcrypt.genSalt(12);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
  },
});

Utilizador.prototype.verificarPassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

Utilizador.prototype.toJSON = function () {
  var values = Object.assign({}, this.get());
  delete values.password;
  delete values.token_reset;
  delete values.token_reset_expira;
  return values;
};

module.exports = Utilizador;
