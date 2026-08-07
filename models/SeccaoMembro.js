var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var SeccaoMembro = sequelize.define("SeccaoMembro", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  seccao_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  funcao: {
    type: DataTypes.ENUM("Responsavel", "Membro"),
    defaultValue: "Membro",
  },
}, {
  tableName: "seccoes_colaboradores",
  timestamps: true,
  indexes: [
    { unique: true, fields: ["seccao_id", "colaborador_id"] },
  ],
});

module.exports = SeccaoMembro;
