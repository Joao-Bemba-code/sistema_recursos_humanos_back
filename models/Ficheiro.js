var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Registo dos ficheiros (PDF, Word, imagens) carregados no sistema.
// O CONTEUDO nao fica na base de dados: e guardado no Cloudinary e aqui
// ficam apenas os METADADOS (nome, URL, public_id, tamanho). Assim a BD
// nao acumula dados e os documentos sobrevivem aos deploys do Render
// (o disco da instancia gratuita e volatil).
var Ficheiro = sequelize.define("Ficheiro", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  carregado_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  pasta: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: "geral",
    comment: "Categoria: pedidos, fotografias, curriculos, logos, ...",
  },
  nome: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: "Nome original do ficheiro",
  },
  tipo: {
    type: DataTypes.STRING(150),
    allowNull: true,
    comment: "MIME type",
  },
  tamanho: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Tamanho original em bytes",
  },
  url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: "URL final (Cloudinary ou /uploads/... em fallback local)",
  },
  public_id: {
    type: DataTypes.STRING(300),
    allowNull: true,
    comment: "public_id no Cloudinary (para apagar/gerir)",
  },
  caminho_antigo: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: "Caminho /uploads/... usado antes da migracao para o Cloudinary",
  },
}, {
  tableName: "ficheiros",
  timestamps: true,
});

module.exports = Ficheiro;
