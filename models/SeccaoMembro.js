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
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: null,
  },
}, {
  tableName: "seccoes_colaboradores",
  timestamps: true,
  indexes: [
    { unique: true, fields: ["seccao_id", "colaborador_id"] },
  ],
});

module.exports = SeccaoMembro;
