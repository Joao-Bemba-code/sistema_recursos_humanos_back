var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Uma tarefa diaria atribuida a um colaborador, com prazo de entrega,
// progresso acompanhado em tempo real e avaliacao AUTOMATICA (nota 0-20
// calculada com base na progressao e no cumprimento do prazo).
var Tarefa = sequelize.define("Tarefa", {
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
    comment: "Colaborador que executa a tarefa",
  },
  atribuido_por: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: "Utilizador que atribuiu/criou a tarefa",
  },
  titulo: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  prazo: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: "Data limite de entrega",
  },
  prazo_hora: {
    type: DataTypes.TIME,
    allowNull: true,
    comment: "Hora limite do prazo (HH:MM). Opcional - sem hora vale o fim do dia",
  },
  prioridade: {
    type: DataTypes.ENUM("Baixa", "Media", "Alta", "Urgente"),
    allowNull: false,
    defaultValue: "Media",
  },
  estado: {
    type: DataTypes.ENUM("Pendente", "Em_curso", "Concluida", "Validada", "Cancelada"),
    allowNull: false,
    defaultValue: "Pendente",
  },
  progresso: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: "Percentagem de conclusao (0-100)",
  },
  data_inicio: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  data_conclusao: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  atraso_dias: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: "Dias de atraso na entrega",
  },
  atraso_minutos: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: "Minutos de atraso face ao prazo (data + hora)",
  },
  nota: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
    comment: "Nota automatica de 0 a 20",
  },
  classificacao: {
    type: DataTypes.STRING(30),
    allowNull: true,
    comment: "Excelente/Bom/Suficiente/Insuficiente/Mau",
  },
  avaliacao_detalhes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Explicacao da nota automatica",
  },
  observacoes_conclusao: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Observacoes do colaborador ao concluir",
  },
  validacao_observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Observacoes do gestor na validacao",
  },
}, {
  tableName: "tarefas",
  timestamps: true,
  indexes: [
    { fields: ["organizacao_id", "colaborador_id"] },
    { fields: ["organizacao_id", "estado"] },
    { fields: ["organizacao_id", "prazo"] },
  ],
});

// Historico de tudo o que aconteceu com a tarefa (criacao, progresso,
// conclusao, validacao, ...). Alimenta o historico no portal.
var TarefaEvento = sequelize.define("TarefaEvento", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  tarefa_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  utilizador_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  acao: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: "criada, iniciada, progresso, concluida, validada, reaberta, cancelada, editada",
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  dados: {
    type: DataTypes.JSON,
    allowNull: true,
  },
}, {
  tableName: "tarefa_eventos",
  timestamps: true,
});

module.exports = { Tarefa, TarefaEvento };
