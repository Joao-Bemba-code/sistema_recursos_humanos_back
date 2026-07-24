var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var OcorrenciaDisciplinar = sequelize.define("OcorrenciaDisciplinar", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  numero: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
  },
  tipo: {
    type: DataTypes.ENUM("Advertencia", "Suspenso", "Reprovacao", "Despedimento", "Outra"),
    allowNull: false,
  },
  data_ocorrencia: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  testemunhas: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  providencias: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  penalidade: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  duracao_suspensao: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Dias de suspensão",
  },
  estado: {
    type: DataTypes.ENUM("Registada", "Em_analise", "Resolvida", "Arquivada"),
    defaultValue: "Registada",
  },
  registado_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  documento: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: "ocorrencias_disciplinares",
  timestamps: true,
});

module.exports = OcorrenciaDisciplinar;
