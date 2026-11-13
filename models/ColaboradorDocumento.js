var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Documentos anexados a um colaborador (fotografia, CV, BI, certificado,
// contrato assinado e outros). O conteudo continua no Cloudinary/disco; aqui
// ficam apenas os metadados, o estado da conferencia e o rasto de quem fez o
// que (carregou, substituiu, validou ou pediu correcao).
var ColaboradorDocumento = sequelize.define("ColaboradorDocumento", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  // fotografia | curriculo | bi | certificado | contrato | outro
  categoria: {
    type: DataTypes.STRING(30),
    allowNull: false,
  },
  // Preenchido quando a categoria e "outro" (ex.: "Certificado medico")
  tipo_documento: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ficheiro_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  ficheiro_nome: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  ficheiro_tipo: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  ficheiro_tamanho: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  // Em falta | Por conferir | Validado | A corrigir
  estado: {
    type: DataTypes.STRING(30),
    allowNull: false,
    defaultValue: "Em falta",
  },
  motivo_correcao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  carregado_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  carregado_em: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  validado_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  validado_em: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: "colaborador_documentos",
  timestamps: true,
  indexes: [
    { fields: ["colaborador_id"] },
    { fields: ["organizacao_id"] },
    { fields: ["estado"] },
  ],
});

// Historico de acoes sobre cada documento. Serve para provar quem carregou,
// substituiu ou validou, mesmo depois de uma substituicao.
var ColaboradorDocumentoEvento = sequelize.define("ColaboradorDocumentoEvento", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  documento_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  // carregado | substituido | validado | corrigir | removido
  acao: {
    type: DataTypes.STRING(30),
    allowNull: false,
  },
  estado_anterior: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  estado_novo: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  ficheiro_url: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  ficheiro_url_anterior: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  ficheiro_nome: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  motivo: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  utilizador_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  tableName: "colaborador_documento_eventos",
  timestamps: true,
  indexes: [
    { fields: ["documento_id"] },
    { fields: ["colaborador_id"] },
  ],
});

module.exports = { ColaboradorDocumento, ColaboradorDocumentoEvento };
