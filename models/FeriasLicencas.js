var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Ferias = sequelize.define("Ferias", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  ano: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  dias_totais: {
    type: DataTypes.INTEGER,
    defaultValue: 22,
  },
  dias_gozados: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  dias_restantes: {
    type: DataTypes.INTEGER,
    defaultValue: 22,
  },
  estado: {
    type: DataTypes.ENUM("Pendente", "Aprovado", "Rejeitado", "Gozado", "Cancelado"),
    defaultValue: "Pendente",
  },
}, {
  tableName: "ferias",
  timestamps: true,
});

var SolicitacaoFerias = sequelize.define("SolicitacaoFerias", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  data_inicio: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  data_fim: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  dias_solicitados: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  motivo: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  estado: {
    type: DataTypes.ENUM("Pendente", "Aprovado", "Rejeitado", "Cancelado"),
    defaultValue: "Pendente",
  },
  aprovado_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  data_aprovacao: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  observacoes_aprovacao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: "solicitacoes_ferias",
  timestamps: true,
});

var Licenca = sequelize.define("Licenca", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  tipo: {
    type: DataTypes.ENUM("Medica", "Maternidade", "Paternidade", "Casamento", "Falecimento", "Formacao", "Sem_Vencimento", "Outra"),
    allowNull: false,
  },
  data_inicio: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  data_fim: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  dias: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  motivo: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  documento: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  estado: {
    type: DataTypes.ENUM("Pendente", "Aprovada", "Rejeitada", "Em_curso", "Concluida"),
    defaultValue: "Pendente",
  },
  aprovado_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: "licencas",
  timestamps: true,
});

module.exports = { Ferias, SolicitacaoFerias, Licenca };
