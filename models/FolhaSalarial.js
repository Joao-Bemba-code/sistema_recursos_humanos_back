var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Vencimento = sequelize.define("Vencimento", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  salario_base: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  subsidio_alimentacao: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  subsidio_transporte: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  subsidio_educacao: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  outros_subsidios: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  total_bruto: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  desconto_irt: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  desconto_seguranca_social: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  outros_descontos: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  total_liquido: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  data_inicio: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  data_fim: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  estado: {
    type: DataTypes.ENUM("Activo", "Inactivo"),
    defaultValue: "Activo",
  },
}, {
  tableName: "vencimentos",
  timestamps: true,
});

var Pagamento = sequelize.define("Pagamento", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  mes: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  ano: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  salario_base: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  subsidios: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  horas_extras: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  descontos: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  irt: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  seguranca_social: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
  total_liquido: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
  estado: {
    type: DataTypes.ENUM("Pendente", "Pago", "Cancelado"),
    defaultValue: "Pendente",
  },
  data_pagamento: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  recibo: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: "pagamentos",
  timestamps: true,
  indexes: [
    { fields: ["colaborador_id", "mes", "ano"], unique: true },
  ],
});

module.exports = { Vencimento, Pagamento };
