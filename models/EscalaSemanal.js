var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Escala semanal de um colaborador: um horario por dia da semana
// (0=domingo ... 6=sabado, numeracao do JS getDay). Hora de entrada e saida
// ambas preenchidas = dia de trabalho com esse horario; ambas vazias = descanso.
// Um horario pode passar da meia-noite (ex.: seguranca 20:00-04:00) — nesse
// caso a saida acontece no dia seguinte.
// Se o colaborador nao tiver nenhuma linha nesta tabela, o biometro usa o
// fallback antigo: dias_descanso da ficha + horario global (08:00/16:00).
var EscalaSemanal = sequelize.define("EscalaSemanal", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  dia_semana: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 0, max: 6 },
  },
  hora_entrada: {
    type: DataTypes.STRING(5),
    allowNull: true,
  },
  hora_saida: {
    type: DataTypes.STRING(5),
    allowNull: true,
  },
}, {
  tableName: "escalas_semanais",
  timestamps: true,
  indexes: [
    { fields: ["colaborador_id", "dia_semana"], unique: true },
    { fields: ["colaborador_id"] },
  ],
});

module.exports = EscalaSemanal;
