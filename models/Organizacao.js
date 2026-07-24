var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Organizacao = sequelize.define("Organizacao", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  nome: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  nome_curto: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  nif: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true,
  },
  email: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  telefone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  endereco: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  cidade: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  provincia: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  pais: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: "Angola",
  },
  logo: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  website: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  dominio: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: "organizacoes",
  timestamps: true,
});

module.exports = Organizacao;
