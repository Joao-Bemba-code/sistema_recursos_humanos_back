var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Seccao = sequelize.define("Seccao", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  departamento_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  nome: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  codigo: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  responsavel_nome: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  telefone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  localizacao: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  nivel: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: true,
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: "seccoes",
  timestamps: true,
});

module.exports = Seccao;
