var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Aviso = sequelize.define("Aviso", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  titulo: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  conteudo: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM("Geral", "Urgente", "Informativo", "Evento"),
    defaultValue: "Geral",
  },
  visivel_para: {
    type: DataTypes.ENUM("Todos", "Departamento", "Cargo", "Perfil"),
    defaultValue: "Todos",
  },
  departamento_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  data_inicio: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  data_fim: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  publicado: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: "avisos",
  timestamps: true,
});

module.exports = { Aviso };
