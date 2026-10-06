var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Anexos dos comunicados guardados NA BASE DE DADOS (base64). O disco da
// instancia gratuita do Render e volatil (reinicios/deploys apagam ficheiros),
// por isso os documentos ficam em LONGTEXT e sobrevivem aos deploys.
var ComunicacaoAnexo = sequelize.define("ComunicacaoAnexo", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  comunicado_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  nome: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  tipo: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  tamanho: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  dados: {
    type: DataTypes.TEXT("long"),
    allowNull: false,
  },
}, {
  tableName: "comunicado_anexos",
  timestamps: true,
});

module.exports = { ComunicacaoAnexo };
