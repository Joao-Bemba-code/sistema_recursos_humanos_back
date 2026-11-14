var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Unidade organizacional: fica dentro de um sector/secção e pode ser
// partilhada por sectores de outros departamentos (via unidades_seccoes).
var Unidade = sequelize.define("Unidade", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: true,
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
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: "unidades",
  timestamps: true,
});

var UnidadeSeccao = sequelize.define("UnidadeSeccao", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  unidade_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  seccao_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
}, {
  tableName: "unidades_seccoes",
  timestamps: true,
  indexes: [
    { unique: true, fields: ["unidade_id", "seccao_id"] },
  ],
});

module.exports = { Unidade, UnidadeSeccao };
