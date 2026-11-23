var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Movimentos do banco de horas.
// horas e SEMPRE assinado: negativo = divida (saida antecipada), positivo =
// credito (horas trabalhadas a mais). horas_compensadas regista quanto foi
// abatido por compensacao automatica, sem apagar o valor original.
// estado: aberto (ainda conta para o saldo), justificado (nao desconta),
// descontado (ja foi descontado na folha).
var BancoHoraMovimento = sequelize.define("BancoHoraMovimento", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  registo_presenca_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  pedido_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  pagamento_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  tipo: {
    type: DataTypes.ENUM("deficit_saida_antecipada", "compensacao"),
    allowNull: false,
  },
  data: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  horas: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  horas_compensadas: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0,
  },
  estado: {
    type: DataTypes.ENUM("aberto", "justificado", "descontado"),
    defaultValue: "aberto",
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  justificado_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  justificado_em: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  processada_mes: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  processada_ano: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  valor_descontado: {
    type: DataTypes.DECIMAL(12, 2),
    defaultValue: 0,
  },
}, {
  tableName: "banco_horas_movimentos",
  timestamps: true,
  indexes: [
    { fields: ["colaborador_id", "data"] },
    { fields: ["colaborador_id", "estado"] },
    { fields: ["registo_presenca_id"] },
    { fields: ["pedido_id"] },
  ],
});

module.exports = { BancoHoraMovimento };
