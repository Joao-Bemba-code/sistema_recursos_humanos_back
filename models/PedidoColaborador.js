var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var PedidoColaborador = sequelize.define("PedidoColaborador", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  tipo: {
    type: DataTypes.ENUM("ferias", "adiantamento", "justificacao", "aumento", "dispensa", "licenca", "outro"),
    allowNull: false,
  },
  titulo: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // 'processando' e o estado intermedio: o admin aceita o pedido e o
  // colaborador passa a ver que esta a ser tratado, antes da decisao final.
  estado: {
    type: DataTypes.ENUM("pendente", "processando", "aprovado", "rejeitado", "cancelado"),
    defaultValue: "pendente",
  },
  dados: {
    type: DataTypes.JSON,
    allowNull: true,
  },
  responded_by: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  responded_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  comentario: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  documento: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: "pedidos_colaborador",
  timestamps: true,
  indexes: [
    { fields: ["organizacao_id", "colaborador_id"] },
    { fields: ["organizacao_id", "estado"] },
    { fields: ["colaborador_id", "estado"] },
  ],
});

module.exports = PedidoColaborador;
