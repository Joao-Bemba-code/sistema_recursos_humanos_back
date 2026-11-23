var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var CursoFormacao = sequelize.define("CursoFormacao", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  organizacao_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: "Organizacao dona do curso (isolamento entre organizacoes)",
  },
  nome: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  descricao: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  categoria: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  tipo: {
    type: DataTypes.ENUM("Interno", "Externo", "Online", "Seminario", "Workshop"),
    defaultValue: "Interno",
  },
  horas: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  data_inicio: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  data_fim: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  vagas: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  local: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  // Nota mínima (0-20) para o colaborador ser dado como Aprovado.
  nota_minima_aprovacao: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
    defaultValue: 10,
  },
  estado: {
    type: DataTypes.ENUM("Planeado", "Em_curso", "Concluido", "Cancelado"),
    defaultValue: "Planeado",
  },
}, {
  tableName: "cursos_formacao",
  timestamps: true,
});

var InscricaoFormacao = sequelize.define("InscricaoFormacao", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  data_inscricao: {
    type: DataTypes.DATEONLY,
    defaultValue: DataTypes.NOW,
  },
  estado: {
    type: DataTypes.ENUM("Inscrito", "Concluido", "Abandonou", "Certificado"),
    defaultValue: "Inscrito",
  },
  nota_avaliacao: {
    type: DataTypes.DECIMAL(4, 2),
    allowNull: true,
  },
  horas_realizadas: {
    // O formulário aceita meio turno (step=0.5), por isso DECIMAL e não INTEGER.
    type: DataTypes.DECIMAL(6, 2),
    allowNull: true,
  },
  // Resultado obtido: nota (0-20) + conceito calculado (Aprovado/Reprovado).
  resultado: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  // Avaliação formal registada pelo RH: quando, por quem e observações.
  data_avaliacao: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  avaliado_por: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: "Utilizador que registou a avaliação",
  },
  avaliacao_observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Conclusão manual: o RH pode dar a formação como concluída mesmo quando a
  // data de fim prevista já passou ou o curso ainda não tem data de término.
  data_conclusao: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  concluida_manualmente: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  certificado: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  data_certificado: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  // Ficheiro (PDF/PNG/JPG) do certificado real, carregado pelo RH/admin.
  // A referência aponta para a tabela `ficheiros` (metadados; conteúdo na nuvem).
  certificado_ficheiro_id: {
    type: DataTypes.UUID,
    allowNull: true,
    comment: "PDF/PNG/JPG do certificado assinado/escaneado",
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: "inscricoes_formacao",
  timestamps: true,
});

module.exports = { CursoFormacao, InscricaoFormacao };
