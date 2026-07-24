var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var CicloAvaliacao = sequelize.define("CicloAvaliacao", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  nome: {
    type: DataTypes.STRING(150),
    allowNull: false,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  data_inicio: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  data_fim: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  estado: {
    type: DataTypes.ENUM("Planeado", "Em_curso", "Concluido", "Cancelado"),
    defaultValue: "Planeado",
  },
}, {
  tableName: "ciclos_avaliacao",
  timestamps: true,
});

var AvaliacaoDesempenho = sequelize.define("AvaliacaoDesempenho", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  nota_tecnica: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
    comment: "Nota de 0 a 20",
  },
  nota_comportamental: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
  },
  nota_final: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
  },
  classificacao: {
    type: DataTypes.ENUM("Excelente", "Bom", "Suficiente", "Insuficiente", "Mau"),
    allowNull: true,
  },
  objectivos: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "Objectivos e nível de conclusão",
  },
  pontos_fortes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  pontos_melhoria: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  plano_melhoria: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  feedback_avaliador: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  feedback_avaliado: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  estado: {
    type: DataTypes.ENUM("Rascunho", "Submetida", "Validada", "Arquivada"),
    defaultValue: "Rascunho",
  },
}, {
  tableName: "avaliacoes_desempenho",
  timestamps: true,
});

module.exports = { CicloAvaliacao, AvaliacaoDesempenho };
