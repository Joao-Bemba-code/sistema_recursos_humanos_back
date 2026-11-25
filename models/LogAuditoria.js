var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var LogAuditoria = sequelize.define("LogAuditoria", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  utilizador_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  accao: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  modulo: {
    type: DataTypes.STRING(50),
    allowNull: false,
  },
  entidade: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  entidade_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  dados_antes: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  dados_depois: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true,
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Campos do feed de atividades: o colaborador so ve a descricao publica e
  // apenas dos eventos do seu colaborador (ou que ele proprio praticou).
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  descricao_publica: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  visivel_colaborador: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  tableName: "logs_auditoria",
  timestamps: true,
  indexes: [
    { fields: ["utilizador_id"] },
    { fields: ["modulo"] },
    { fields: ["accao"] },
    { fields: ["entidade", "entidade_id"] },
    { fields: ["createdAt"] },
    { fields: ["organizacao_id", "createdAt"] },
    { fields: ["colaborador_id", "createdAt"] },
  ],
});

module.exports = LogAuditoria;
