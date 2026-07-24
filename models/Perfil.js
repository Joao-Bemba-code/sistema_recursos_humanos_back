var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Perfil = sequelize.define("Perfil", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  nome: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  nivel: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: "0=colaborador, 1=tecnico, 2=coordenador, 3=director, 4=admin",
  },
  permissoes: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: "Objecto com modulos e operacoes permitidas",
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: "perfis",
  timestamps: true,
});

module.exports = Perfil;
