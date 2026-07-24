var { sequelize } = require("../config");

var Organizacao = require("./Organizacao");
var Perfil = require("./Perfil");
var Utilizador = require("./Utilizador");
var Colaborador = require("./Colaborador");
var { Departamento, Cargo } = require("./Estrutura");
var Contrato = require("./Contrato");
var { Ferias, SolicitacaoFerias, Licenca } = require("./FeriasLicencas");
var { RegistoPresenca, Turno } = require("./Assiduidade");
var { CicloAvaliacao, AvaliacaoDesempenho } = require("./Avaliacao");
var { CursoFormacao, InscricaoFormacao } = require("./Formacao");
var OcorrenciaDisciplinar = require("./Disciplinar");
var { Vencimento, Pagamento } = require("./FolhaSalarial");
var { Aviso } = require("./Comunicacao");
var Notificacao = require("./Notificacao");
var PedidoColaborador = require("./PedidoColaborador");
var LogAuditoria = require("./LogAuditoria");

// Organizacao -> Utilizadores
Organizacao.hasMany(Utilizador, { foreignKey: "organizacao_id", as: "utilizadores" });
Utilizador.belongsTo(Organizacao, { foreignKey: "organizacao_id", as: "organizacao" });

// Perfil -> Utilizadores
Perfil.hasMany(Utilizador, { foreignKey: "perfil_id", as: "utilizadores" });
Utilizador.belongsTo(Perfil, { foreignKey: "perfil_id", as: "perfil" });

// Organizacao -> Colaboradores
Organizacao.hasMany(Colaborador, { foreignKey: "organizacao_id", as: "colaboradores" });
Colaborador.belongsTo(Organizacao, { foreignKey: "organizacao_id", as: "organizacao" });

// Utilizador -> Colaborador (1:1)
Utilizador.hasOne(Colaborador, { foreignKey: "utilizador_id", as: "colaborador" });
Colaborador.belongsTo(Utilizador, { foreignKey: "utilizador_id", as: "utilizador" });

// Organizacao -> Departamento
Organizacao.hasMany(Departamento, { foreignKey: "organizacao_id", as: "departamentos" });
Departamento.belongsTo(Organizacao, { foreignKey: "organizacao_id", as: "organizacao" });

// Departamento -> Colaboradores
Departamento.hasMany(Colaborador, { foreignKey: "departamento_id", as: "colaboradores" });
Colaborador.belongsTo(Departamento, { foreignKey: "departamento_id", as: "departamento" });

// Cargo -> Colaboradores
Cargo.hasMany(Colaborador, { foreignKey: "cargo_id", as: "colaboradores" });
Colaborador.belongsTo(Cargo, { foreignKey: "cargo_id", as: "cargo" });

// Colaborador -> Contratos
Colaborador.hasMany(Contrato, { foreignKey: "colaborador_id", as: "contratos" });
Contrato.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// Colaborador -> Ferias
Colaborador.hasMany(Ferias, { foreignKey: "colaborador_id", as: "ferias" });
Ferias.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// Colaborador -> SolicitacaoFerias
Colaborador.hasMany(SolicitacaoFerias, { foreignKey: "colaborador_id", as: "solicitacoes_ferias" });
SolicitacaoFerias.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// Colaborador -> Licencas
Colaborador.hasMany(Licenca, { foreignKey: "colaborador_id", as: "licencas" });
Licenca.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// Colaborador -> Presencas
Colaborador.hasMany(RegistoPresenca, { foreignKey: "colaborador_id", as: "presencas" });
RegistoPresenca.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// Turno -> Presencas
Turno.hasMany(RegistoPresenca, { foreignKey: "turno_id", as: "registos" });
RegistoPresenca.belongsTo(Turno, { foreignKey: "turno_id", as: "turno" });

// Colaborador -> Avaliacoes
Colaborador.hasMany(AvaliacaoDesempenho, { foreignKey: "colaborador_id", as: "avaliacoes" });
AvaliacaoDesempenho.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// CicloAvaliacao -> Avaliacoes
CicloAvaliacao.hasMany(AvaliacaoDesempenho, { foreignKey: "ciclo_id", as: "avaliacoes" });
AvaliacaoDesempenho.belongsTo(CicloAvaliacao, { foreignKey: "ciclo_id", as: "ciclo" });

// Avaliacao -> Avaliador (Utilizador)
Utilizador.hasMany(AvaliacaoDesempenho, { foreignKey: "avaliador_id", as: "avaliacoes_realizadas" });
AvaliacaoDesempenho.belongsTo(Utilizador, { foreignKey: "avaliador_id", as: "avaliador" });

// Colaborador -> InscricoesFormacao
Colaborador.hasMany(InscricaoFormacao, { foreignKey: "colaborador_id", as: "inscricoes" });
InscricaoFormacao.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// CursoFormacao -> Inscricoes
CursoFormacao.hasMany(InscricaoFormacao, { foreignKey: "curso_id", as: "inscricoes" });
InscricaoFormacao.belongsTo(CursoFormacao, { foreignKey: "curso_id", as: "curso" });

// Colaborador -> OcorrenciasDisciplinares
Colaborador.hasMany(OcorrenciaDisciplinar, { foreignKey: "colaborador_id", as: "ocorrencias" });
OcorrenciaDisciplinar.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// Colaborador -> Vencimentos
Colaborador.hasMany(Vencimento, { foreignKey: "colaborador_id", as: "vencimentos" });
Vencimento.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// Colaborador -> Pagamentos
Colaborador.hasMany(Pagamento, { foreignKey: "colaborador_id", as: "pagamentos" });
Pagamento.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// Utilizador -> Notificacoes
Utilizador.hasMany(Notificacao, { foreignKey: "utilizador_id", as: "notificacoes" });
Notificacao.belongsTo(Utilizador, { foreignKey: "utilizador_id", as: "utilizador" });

// Organizacao -> Notificacoes
Organizacao.hasMany(Notificacao, { foreignKey: "organizacao_id", as: "notificacoes" });
Notificacao.belongsTo(Organizacao, { foreignKey: "organizacao_id", as: "organizacao" });

// Colaborador -> PedidosColaborador
Colaborador.hasMany(PedidoColaborador, { foreignKey: "colaborador_id", as: "pedidos" });
PedidoColaborador.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

// Organizacao -> PedidosColaborador
Organizacao.hasMany(PedidoColaborador, { foreignKey: "organizacao_id", as: "pedidos_colaborador" });
PedidoColaborador.belongsTo(Organizacao, { foreignKey: "organizacao_id", as: "organizacao" });

// LogAuditoria -> Utilizador
Utilizador.hasMany(LogAuditoria, { foreignKey: "utilizador_id", as: "logs" });
LogAuditoria.belongsTo(Utilizador, { foreignKey: "utilizador_id", as: "utilizador" });

// Departamento -> Departamento (hierarquia)
Departamento.belongsTo(Departamento, { foreignKey: "departamento_pai_id", as: "pai" });
Departamento.hasMany(Departamento, { foreignKey: "departamento_pai_id", as: "subdepartamentos" });

var syncDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log(" conexao com BD estabelecida!");
    await sequelize.sync({ alter: true });
    console.log(" modelagem BD concluida!");
  } catch (e) {
    console.log(" Erro ao sincronizar BD:", e.message);
    throw e;
  }
};

module.exports = {
  sequelize,
  syncDatabase,
  Organizacao,
  Perfil,
  Utilizador,
  Colaborador,
  Departamento,
  Cargo,
  Contrato,
  Ferias,
  SolicitacaoFerias,
  Licenca,
  RegistoPresenca,
  Turno,
  CicloAvaliacao,
  AvaliacaoDesempenho,
  CursoFormacao,
  InscricaoFormacao,
  OcorrenciaDisciplinar,
  Vencimento,
  Pagamento,
  Aviso,
  Notificacao,
  PedidoColaborador,
  LogAuditoria,
};
