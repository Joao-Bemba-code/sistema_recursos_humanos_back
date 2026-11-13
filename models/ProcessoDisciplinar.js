var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Convocatória para entrevista disciplinar. O numero_processo liga a
// convocatória à medida disciplinar que venha a ser aplicada.
var ConvocatoriaDisciplinar = sequelize.define("ConvocatoriaDisciplinar", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  numero_processo: {
    type: DataTypes.STRING(40),
    allowNull: false,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  factos_imputados: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  data_entrevista: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  hora_entrevista: {
    type: DataTypes.STRING(5),
    allowNull: true,
  },
  local: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  direitos_trabalhador: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Emitida | Entregue | Realizada | Cancelada
  estado: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: "Emitida",
  },
  data_emissao: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  comprovativo_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  comprovativo_nome: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  data_entrega: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  entregue_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  observacoes_entrevista: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  emitido_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  tableName: "convocatorias_disciplinares",
  timestamps: true,
  indexes: [
    { fields: ["colaborador_id"] },
    { fields: ["organizacao_id"] },
    { fields: ["numero_processo"] },
    { fields: ["estado"] },
  ],
});

// Registo da medida disciplinar aplicada ao trabalhador.
var MedidaDisciplinar = sequelize.define("MedidaDisciplinar", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  numero_processo: {
    type: DataTypes.STRING(40),
    allowNull: false,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  convocatoria_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  infracao: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  // Advertencia_verbal | Advertencia_escrita | Suspensao | Despedimento | Multa | Outra
  medida: {
    type: DataTypes.STRING(60),
    allowNull: false,
  },
  fundamentacao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  autoridade_decisora: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  data_decisao: {
    type: DataTypes.DATEONLY,
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
  notificacao_data: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  notificacao_forma: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  comprovativo_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  comprovativo_nome: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  // Em_analise | Decidida | Notificada | Cumprida | Arquivada | Recorrida
  situacao: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: "Em_analise",
  },
  prazo_limite: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  registado_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  tableName: "medidas_disciplinares",
  timestamps: true,
  indexes: [
    { fields: ["colaborador_id"] },
    { fields: ["organizacao_id"] },
    { fields: ["numero_processo"] },
    { fields: ["situacao"] },
    { fields: ["prazo_limite"] },
  ],
});

module.exports = { ConvocatoriaDisciplinar, MedidaDisciplinar };
