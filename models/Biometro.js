var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Picagens recebidas da ponte do biometro (ZKTeco).
// Sem FKs a nivel de BD para compatibilidade com TiDB (como creditos).
var PicagemBiometrico = sequelize.define("PicagemBiometrico", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  id_biometrico: {
    type: DataTypes.STRING(30),
    allowNull: false,
    comment: "ID de utilizador no biometro (mapeado em colaboradores.id_biometrico)",
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: "Preenchido quando o id_biometrico tem colaborador mapeado",
  },
  data_hora: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Estado da picagem devolvido pelo aparelho (0 entrada, 1 saida, etc.)",
  },
  raw: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: "Dados em bruto devolvidos pelo aparelho (para diagnostico)",
  },
  processada: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: "Se ja foi reflectida em registos_presenca",
  },
}, {
  tableName: "picagens_biometrico",
  timestamps: true,
  indexes: [
    { fields: ["id_biometrico", "data_hora"], unique: true },
    { fields: ["colaborador_id"] },
    { fields: ["processada"] },
  ],
});

module.exports = { PicagemBiometrico };
