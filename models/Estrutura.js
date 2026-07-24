var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Departamento = sequelize.define("Departamento", {
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
    unique: true,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  tipo: {
    type: DataTypes.ENUM("Direccao", "Departamento", "Sector", "Seccao", "Gabinete"),
    defaultValue: "Departamento",
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
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: "departamentos",
  timestamps: true,
});

var Cargo = sequelize.define("Cargo", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
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
  categoria: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  nivel_minimo: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  salario_minimo: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  salario_maximo: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: true,
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: "cargos",
  timestamps: true,
});

module.exports = { Departamento, Cargo };
