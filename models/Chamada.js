var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// ==================== CONFERENCIA (CHAMADAS) ====================
// Chamadas de voz/video 1:1 entre dois utilizadores de uma conversa directa.
// O video em si passa entre os navegadores (WebRTC); o servidor guarda só o
// estado da chamada e os sinais de negociacao (offer/answer/ICE), que os
// ecras vo buscar por polling. Sem FKs a nivel de BD (TiDB).

var Chamada = sequelize.define("Chamada", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  conversa_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  iniciador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM("audio", "video"),
    allowNull: false,
    defaultValue: "audio",
  },
  estado: {
    type: DataTypes.ENUM("a_tocar", "aceite", "terminada", "recusada", "sem_resposta"),
    allowNull: false,
    defaultValue: "a_tocar",
  },
  terminada_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  aceites: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "JSON com os ids de quem ja aceitou/juntou",
  },
  saiu: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "JSON com os ids de quem saiu da chamada",
  },
  recusados: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "JSON com os ids de quem recusou o toque",
  },
}, {
  tableName: "chamadas",
  timestamps: true,
  indexes: [
    { fields: ["conversa_id", "estado"] },
    { fields: ["organizacao_id"] },
  ],
});

// Sinal de negociacao WebRTC trocado entre os dois participantes.
var ChamadaSinal = sequelize.define("ChamadaSinal", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  chamada_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  remetente_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  destinatario_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: "Para quem e o sinal (null = para todos os outros)",
  },
  tipo: {
    type: DataTypes.ENUM("offer", "answer", "ice"),
    allowNull: false,
  },
  corpo: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: "JSON do sinal (descricao ou candidato ICE)",
  },
}, {
  tableName: "chamada_sinais",
  timestamps: true,
  indexes: [
    { fields: ["chamada_id", "createdAt"] },
  ],
});

module.exports = { Chamada, ChamadaSinal };
