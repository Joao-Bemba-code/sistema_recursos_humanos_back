var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Feriados da organizacao: nestes dias ninguem e marcado "Ausente" automatico
// pelo biometro (mesmo que seja dia de trabalho de quem esta escalado ao sabado).
var Feriado = sequelize.define("Feriado", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  data: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    unique: true,
  },
  descricao: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  tableName: "feriados",
  timestamps: true,
  indexes: [
    { fields: ["data"], unique: true },
  ],
});

module.exports = Feriado;
