var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

// Tarefa atribuida por um gestor a UM OU VARIOS colaboradores. Cada
// colaborador tem a sua propria janela de execucao (tabela tarefa_alocacoes)
// e a sua propria avaliacao final (nota + observacoes dadas pelo gestor).
// O progresso e AUTOMATICO: tempo decorrido / duracao da janela.
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
    comment: "Primeiro colaborador atribuido (legacy/filtros). A execucao vive em tarefa_alocacoes",
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
    type: DataTypes.ENUM("Pendente", "Em_curso", "Atrasada", "Concluida", "Validada", "Cancelada"),
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
    comment: "Media das notas dadas pelo gestor as alocacoes validadas (0-20)",
  },
  classificacao: {
    type: DataTypes.STRING(30),
    allowNull: true,
    comment: "Excelente/Bom/Suficiente/Insuficiente/Mau (derivada da media)",
  },
  avaliacao_detalhes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Resumo das avaliacoes do gestor (derivado)",
  },
  observacoes_conclusao: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Observacoes do colaborador ao concluir (legacy)",
  },
  validacao_observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Observacoes gerais do gestor na validacao",
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

// Atribuicao de UM colaborador a uma tarefa, com a SUA janela de execucao
// (data/hora de inicio -> data/hora de fim), o seu progresso automatico e a
// SUA avaliacao final (nota + observacoes do gestor). Estados:
//   Pendente     - aguarda o colaborador clicar "Iniciar" (ou justificar)
//   Em_curso     - iniciada; o progresso cresce sozinho com o tempo
//   Reaberta     - devolvida pelo gestor para correccoes (corre como Em_curso)
//   Justificativa- colaborador nao consegue fazer e motivou; decisao do gestor
//   Atrasada     - janela terminou sem concluir; SEM avaliacao automatica -
//                  fica pendente de decisao do gestor (reabrir, eliminar ou
//                  avaliar manualmente, tendo em conta a justificativa)
//   Concluida    - colaborador clicou "Terminar"; avaliacao automatica pela rapidez
//   Validada     - avaliacao registada (automatica ou revalidada pelo gestor)
//   Cancelada    - aceite a justificativa / removida pelo gestor (sem penalizacao)
var TarefaAlocacao = sequelize.define("TarefaAlocacao", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  tarefa_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  colaborador_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  atribuido_por: {
    type: DataTypes.UUID,
    allowNull: false,
    comment: "Gestor que atribuiu esta janela ao colaborador",
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "O que este colaborador deve fazer dentro da tarefa (subtarefa)",
  },
  estado: {
    type: DataTypes.ENUM("Pendente", "Em_curso", "Reaberta", "Justificativa", "Atrasada", "Concluida", "Validada", "Cancelada"),
    allowNull: false,
    defaultValue: "Pendente",
  },
  janela_inicio: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: "Data e hora de inicio da janela do colaborador",
  },
  janela_fim: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: "Data e hora de fim da janela do colaborador (prazo individual)",
  },
  data_inicio: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: "Momento em que o colaborador clicou Iniciar",
  },
  data_conclusao: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: "Fim da janela (conclusao automatica)",
  },
  progresso: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: "Progresso calculado automaticamente (0-100)",
  },
  justificativa: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Motivo apresentado pelo colaborador (estado Justificativa)",
  },
  justificativa_decisao: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Observacoes do gestor na decisao da justificativa",
  },
  justificativa_data: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  nota: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
    comment: "Nota final 0-20 = media dos indicadores (desempenho, produtividade, cumprimento do prazo)",
  },
  desempenho: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
    comment: "Indicador 0-20: como o colaborador executou a tarefa",
  },
  produtividade: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
    comment: "Indicador 0-20: quantidade/ritmo do trabalho realizado",
  },
  cumprimento_prazo: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
    comment: "Indicador 0-20: entregou dentro da janela definida",
  },
  classificacao: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Observacoes do gestor para este colaborador",
  },
  avaliado_por: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  avaliado_em: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: "tarefa_alocacoes",
  timestamps: true,
  indexes: [
    { fields: ["organizacao_id", "tarefa_id"] },
    { fields: ["organizacao_id", "colaborador_id"] },
    { fields: ["organizacao_id", "estado"] },
    { fields: ["tarefa_id", "colaborador_id"] },
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
    comment: "criada, editada, iniciada, justificativa, justificativa_aceita, justificativa_rejeitada, concluida, avaliada, reaberta, validada, cancelada, reatribuida",
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

module.exports = { Tarefa, TarefaEvento, TarefaAlocacao };
