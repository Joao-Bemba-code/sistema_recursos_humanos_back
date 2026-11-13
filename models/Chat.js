var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// ==================== CHAT INTERNO ====================
// Conversa geral (uma por organizacao) ou conversa directa entre dois
// utilizadores. Sem FKs a nivel de BD para compatibilidade com TiDB.
// Os colaboradores falam entre si e com os administradores; todos podem
// escrever no canal geral.

var Conversa = sequelize.define("Conversa", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM("geral", "direta"),
    allowNull: false,
    defaultValue: "direta",
  },
  titulo: {
    type: DataTypes.STRING(150),
    allowNull: true,
    comment: "Titulo visivel (usado no canal geral)",
  },
}, {
  tableName: "conversas",
  timestamps: true,
  indexes: [
    { fields: ["organizacao_id", "tipo"] },
  ],
});

// Participante de uma conversa. Nas directas sao sempre dois utilizadores;
// no geral a linha e criada quando o utilizador abre ou escreve pela
// primeira vez. ultima_leitura marca ate onde o utilizador ja leu.
var ConversaParticipante = sequelize.define("ConversaParticipante", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  conversa_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  utilizador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  ultima_leitura: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: "Momento ate ao qual o utilizador leu a conversa (null = nunca)",
  },
}, {
  tableName: "conversa_participantes",
  timestamps: true,
  indexes: [
    { fields: ["conversa_id", "utilizador_id"] },
    { fields: ["utilizador_id"] },
  ],
});

var Mensagem = sequelize.define("Mensagem", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  conversa_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  utilizador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  texto: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  // Anexo opcional: guarda-se o URL (Cloudinary) e os dados para mostrar e
  // descarregar sem ir a tabela `ficheiros`.
  anexo_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  anexo_nome: {
    type: DataTypes.STRING(250),
    allowNull: true,
  },
  anexo_tipo: {
    type: DataTypes.STRING(120),
    allowNull: true,
  },
  anexo_tamanho: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
}, {
  tableName: "mensagens",
  timestamps: true,
  indexes: [
    { fields: ["conversa_id", "createdAt"] },
  ],
});

module.exports = { Conversa, ConversaParticipante, Mensagem };
