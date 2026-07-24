var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Notificacao = sequelize.define("Notificacao", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  utilizador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  titulo: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  mensagem: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM("info", "warning", "success", "error"),
    defaultValue: "info",
  },
  lida: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  link: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: "notificacoes",
  timestamps: true,
  indexes: [
    { fields: ["organizacao_id", "utilizador_id"] },
    { fields: ["utilizador_id", "lida"] },
  ],
});

module.exports = Notificacao;
