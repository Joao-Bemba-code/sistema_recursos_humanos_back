var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Credito = sequelize.define("Credito", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  valor: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    comment: "Valor total concedido ao colaborador",
  },
  desconto_mensal: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
    comment: "Valor fixo descontado em cada folha salarial processada",
  },
  valor_pago: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
    comment: "Total ja descontado ate agora",
  },
  data_concessao: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  motivo: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  estado: {
    type: DataTypes.ENUM("Ativo", "Pago", "Cancelado"),
    defaultValue: "Ativo",
  },
  criado_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  tableName: "creditos",
  timestamps: true,
});

var CreditoMovimento = sequelize.define("CreditoMovimento", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  credito_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  pagamento_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  mes: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  ano: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  valor_descontado: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false,
  },
}, {
  tableName: "creditos_movimentos",
  timestamps: true,
  indexes: [
    { fields: ["credito_id", "mes", "ano"], unique: true },
    { fields: ["colaborador_id"] },
    { fields: ["pagamento_id"] },
  ],
});

module.exports = { Credito, CreditoMovimento };
