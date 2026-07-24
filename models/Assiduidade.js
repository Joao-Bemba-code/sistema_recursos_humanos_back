var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var RegistoPresenca = sequelize.define("RegistoPresenca", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  data: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  hora_entrada: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  hora_saida: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  horas_trabalhadas: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true,
  },
  horas_extras: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0,
  },
  estado: {
    type: DataTypes.ENUM("Presente", "Ausente", "Atrasado", "Licenca", "Ferias", "Fim_semana"),
    defaultValue: "Presente",
  },
  metodo: {
    type: DataTypes.ENUM("Manual", "Biometrico", "GPS", "QR_Code"),
    defaultValue: "Manual",
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: "registos_presenca",
  timestamps: true,
  indexes: [
    { fields: ["data"] },
    { fields: ["colaborador_id", "data"], unique: true },
  ],
});

var Turno = sequelize.define("Turno", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  nome: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  hora_inicio: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  hora_fim: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  dias_semana: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: "Array com dias: [1,2,3,4,5] (segunda a sexta)",
  },
  flexivel: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  activo: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: "turnos",
  timestamps: true,
});

module.exports = { RegistoPresenca, Turno };
