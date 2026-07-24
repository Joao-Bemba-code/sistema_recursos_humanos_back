var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Contrato = sequelize.define("Contrato", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  numero: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
  },
  tipo: {
    type: DataTypes.ENUM("Determinado", "Indeterminado", "Prestacao_Servicos", "Estagio", "Temporario"),
    defaultValue: "Indeterminado",
  },
  data_inicio: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  data_fim: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  data_assinatura: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  salario_base: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  moeda: {
    type: DataTypes.STRING(3),
    defaultValue: "AOA",
  },
  periodo_experimentacao: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Dias de periodo de experimentação",
  },
  funcao: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  local_trabalho: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  horario_trabalho: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  estado: {
    type: DataTypes.ENUM("Activo", "Suspenso", "Rescindido", "Expirado", "Renovado"),
    defaultValue: "Activo",
  },
  motivo_rescisao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  data_rescisao: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  documento: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: "contratos",
  timestamps: true,
  indexes: [
    { fields: ["numero"], unique: true },
    { fields: ["estado"] },
    { fields: ["data_fim"] },
    { fields: ["tipo"] },
  ],
});

module.exports = Contrato;
