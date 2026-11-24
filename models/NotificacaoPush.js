var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Um utilizador pode ter varios dispositivos (telemovel, computador, etc.).
// O endpoint identifica cada subscricao do navegador. Como ele pode ser longo,
// guardamos tambem um hash unico para criar o indice sem limites do MySQL.
var NotificacaoPush = sequelize.define("NotificacaoPush", {
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
  endpoint_hash: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
  endpoint: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  p256dh: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  auth: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  user_agent: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  ativo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  ultimo_envio: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  ultimo_acesso: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: "notificacoes_push",
  timestamps: true,
  indexes: [
    { fields: ["organizacao_id", "utilizador_id", "ativo"] },
    { fields: ["utilizador_id", "ativo"] },
  ],
});

module.exports = NotificacaoPush;
