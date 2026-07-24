var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var Colaborador = sequelize.define("Colaborador", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  numero_colaborador: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
  },
  nome_completo: {
    type: DataTypes.STRING(200),
    allowNull: false,
  },
  nome_curto: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  data_nascimento: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  genero: {
    type: DataTypes.ENUM("M", "F", "Outro"),
    allowNull: true,
  },
  estado_civil: {
    type: DataTypes.ENUM("Solteiro(a)", "Casado(a)", "Divorciado(a)", "Viúvo(a)", "União de Facto"),
    allowNull: true,
  },
  nif: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  bi: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  bi_validade: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  email_pessoal: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  email_institucional: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  telefone: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  telefone_emergencia: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  endereco: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  cidade: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  provincia: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  fotografia: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  numero_seguranca_social: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  conta_bancaria: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  banco: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  iban: {
    type: DataTypes.STRING(30),
    allowNull: true,
  },
  habilitacoes: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  formacao_academica: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  curriculo: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
  tipo_colaborador: {
    type: DataTypes.ENUM("Interno", "Externo", "Formador_Interno", "Formador_Externo", "Estagiario"),
    defaultValue: "Interno",
  },
  estado: {
    type: DataTypes.ENUM("Activo", "Inactivo", "Suspenso", "Aposentado", "Desligado"),
    defaultValue: "Activo",
  },
  utilizador_id: {
    type: DataTypes.UUID,
    allowNull: true,
  },
  data_admissao: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  data_desligamento: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  motivo_desligamento: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  observacoes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: "colaboradores",
  timestamps: true,
  indexes: [
    { fields: ["numero_colaborador"], unique: true },
    { fields: ["estado"] },
    { fields: ["tipo_colaborador"] },
    { fields: ["nome_completo"] },
  ],
});

module.exports = Colaborador;
