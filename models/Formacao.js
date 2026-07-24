var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var CursoFormacao = sequelize.define("CursoFormacao", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  nome: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  categoria: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  tipo: {
    type: DataTypes.ENUM("Interno", "Externo", "Online", "Seminario", "Workshop"),
    defaultValue: "Interno",
  },
  horas: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  data_inicio: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  data_fim: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  vagas: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  local: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  estado: {
    type: DataTypes.ENUM("Planeado", "Em_curso", "Concluido", "Cancelado"),
    defaultValue: "Planeado",
  },
}, {
  tableName: "cursos_formacao",
  timestamps: true,
});

var InscricaoFormacao = sequelize.define("InscricaoFormacao", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  data_inscricao: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW,
  },
  estado: {
    type: DataTypes.ENUM("Inscrito", "Concluido", "Abandonou", "Certificado"),
    defaultValue: "Inscrito",
  },
  nota_avaliacao: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
  },
  horas_realizadas: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  certificado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  data_certificado: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: "inscricoes_formacao",
  timestamps: true,
});

module.exports = { CursoFormacao, InscricaoFormacao };
