var { sequelize } = require("../config");

var Organizacao = require("./Organizacao");
var Perfil = require("./Perfil");
var Utilizador = require("./Utilizador");
var UtilizadorPerfil = require("./UtilizadorPerfil");
var Colaborador = require("./Colaborador");
var { Departamento, Cargo } = require("./Estrutura");
var Seccao = require("./Seccao");
var SeccaoMembro = require("./SeccaoMembro");
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

// Utilizador <-> Perfil (perfis adicionais, muitos-para-muitos)
Utilizador.belongsToMany(Perfil, {
  through: { model: UtilizadorPerfil },
  as: "perfis_extra",
  foreignKey: "utilizador_id",
  otherKey: "perfil_id",
  constraints: false,
});
Perfil.belongsToMany(Utilizador, {
  through: { model: UtilizadorPerfil },
  as: "utilizadores_extra",
  foreignKey: "perfil_id",
  otherKey: "utilizador_id",
  constraints: false,
});

// Organizacao -> Colaboradores
Organizacao.hasMany(Colaborador, { foreignKey: "organizacao_id", as: "colaboradores" });
Colaborador.belongsTo(Organizacao, { foreignKey: "organizacao_id", as: "organizacao" });

// Utilizador -> Colaborador (1:1)
Utilizador.hasOne(Colaborador, { foreignKey: "utilizador_id", as: "colaborador" });
Colaborador.belongsTo(Utilizador, { foreignKey: "utilizador_id", as: "utilizador" });

// Organizacao -> Departamento
Organizacao.hasMany(Departamento, { foreignKey: "organizacao_id", as: "departamentos" });
Departamento.belongsTo(Organizacao, { foreignKey: "organizacao_id", as: "organizacao" });

// Departamento -> Seccoes
Departamento.hasMany(Seccao, { foreignKey: "departamento_id", as: "seccoes" });
Seccao.belongsTo(Departamento, { foreignKey: "departamento_id", as: "departamento" });

// Organizacao -> Seccoes
Organizacao.hasMany(Seccao, { foreignKey: "organizacao_id", as: "seccoes" });
Seccao.belongsTo(Organizacao, { foreignKey: "organizacao_id", as: "organizacao" });

// Seccao -> Membros (seccoes_colaboradores)
Seccao.hasMany(SeccaoMembro, { foreignKey: "seccao_id", as: "membros" });
SeccaoMembro.belongsTo(Seccao, { foreignKey: "seccao_id", as: "seccao" });
Colaborador.hasMany(SeccaoMembro, { foreignKey: "colaborador_id", as: "seccoes_membro" });
SeccaoMembro.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador" });

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
    console.log(" a verificar colunas na BD...");

    try {
      var resultado = await sequelize.query("SHOW COLUMNS FROM `registos_presenca`");
      var colunas = Array.isArray(resultado[0]) ? resultado[0] : resultado;
      var nomesColunas = colunas.map(function(c) { return c.Field; });
      if (nomesColunas.indexOf("justificado") === -1) {
        await sequelize.query("ALTER TABLE `registos_presenca` ADD COLUMN `justificado` BOOLEAN NOT NULL DEFAULT false");
        console.log(" Coluna 'justificado' adicionada!");
      }
      if (nomesColunas.indexOf("documento_justificacao") === -1) {
        await sequelize.query("ALTER TABLE `registos_presenca` ADD COLUMN `documento_justificacao` VARCHAR(500) NULL");
        console.log(" Coluna 'documento_justificacao' adicionada!");
      }
      if (nomesColunas.indexOf("justificacao_observacoes") === -1) {
        await sequelize.query("ALTER TABLE `registos_presenca` ADD COLUMN `justificacao_observacoes` TEXT NULL");
        console.log(" Coluna 'justificacao_observacoes' adicionada!");
      }
    } catch (alterErr) {
      console.log(" Aviso: problema ao adicionar colunas de justificacao:", alterErr.message);
    }

    try {
      var resultado2 = await sequelize.query("SHOW COLUMNS FROM `pagamentos`");
      var colunas2 = Array.isArray(resultado2[0]) ? resultado2[0] : resultado2;
      var nomes2 = colunas2.map(function(c) { return c.Field; });
      if (nomes2.indexOf("desconto_faltas") === -1) {
        await sequelize.query("ALTER TABLE `pagamentos` ADD COLUMN `desconto_faltas` DECIMAL(12,2) DEFAULT 0");
        console.log(" Coluna 'desconto_faltas' adicionada!");
      }
      if (nomes2.indexOf("data_pagamento") === -1) {
        await sequelize.query("ALTER TABLE `pagamentos` ADD COLUMN `data_pagamento` DATE NULL");
        console.log(" Coluna 'data_pagamento' adicionada!");
      }
      if (nomes2.indexOf("recibo") === -1) {
        await sequelize.query("ALTER TABLE `pagamentos` ADD COLUMN `recibo` VARCHAR(500) NULL");
        console.log(" Coluna 'recibo' adicionada!");
      }
    } catch (alterErr2) {
      console.log(" Aviso: problema ao adicionar colunas de pagamentos:", alterErr2.message);
    }

    try {
      var resultado3 = await sequelize.query("SHOW COLUMNS FROM `organizacoes`");
      var colunas3 = Array.isArray(resultado3[0]) ? resultado3[0] : resultado3;
      var nomes3 = colunas3.map(function(c) { return c.Field; });
      if (nomes3.indexOf("template_contrato") === -1) {
        await sequelize.query("ALTER TABLE `organizacoes` ADD COLUMN `template_contrato` TEXT NULL");
        console.log(" Coluna 'template_contrato' adicionada!");
      }
      if (nomes3.indexOf("logo_url") === -1) {
        await sequelize.query("ALTER TABLE `organizacoes` ADD COLUMN `logo_url` VARCHAR(500) NULL");
        console.log(" Coluna 'logo_url' adicionada!");
      }
    } catch (alterErr3) {
      console.log(" Aviso: problema ao adicionar colunas de organizacoes:", alterErr3.message);
    }

    try {
      var resultado4 = await sequelize.query("SHOW COLUMNS FROM `vencimentos`");
      var colunas4 = Array.isArray(resultado4[0]) ? resultado4[0] : resultado4;
      var nomes4 = colunas4.map(function(c) { return c.Field; });
      if (nomes4.indexOf("colaborador_id") === -1) {
        await sequelize.query("ALTER TABLE `vencimentos` ADD COLUMN `colaborador_id` VARCHAR(36) NULL");
        console.log(" Coluna 'colaborador_id' adicionada a vencimentos!");
      }
    } catch (alterErr4) {
      console.log(" Aviso: problema ao adicionar colunas de vencimentos:", alterErr4.message);
    }

    try {
      var resultado5 = await sequelize.query("SHOW COLUMNS FROM `pedidos_colaborador`");
      var colunas5 = Array.isArray(resultado5[0]) ? resultado5[0] : resultado5;
      var nomes5 = colunas5.map(function(c) { return c.Field; });
      if (nomes5.indexOf("documento") === -1) {
        await sequelize.query("ALTER TABLE `pedidos_colaborador` ADD COLUMN `documento` VARCHAR(500) NULL");
        console.log(" Coluna 'documento' adicionada a pedidos_colaborador!");
      }
    } catch (alterErr5) {
      console.log(" Aviso: problema ao adicionar colunas de pedidos:", alterErr5.message);
    }

    try {
      var resultado6 = await sequelize.query("SHOW COLUMNS FROM `colaboradores`");
      var colunas6 = Array.isArray(resultado6[0]) ? resultado6[0] : resultado6;
      var nomes6 = colunas6.map(function(c) { return c.Field; });
      if (nomes6.indexOf("nome_completo") !== -1) {
        await sequelize.query("ALTER TABLE `colaboradores` MODIFY COLUMN `nome_completo` VARCHAR(200) NULL");
        console.log(" Coluna 'nome_completo' alterada para NULL!");
      }
    } catch (alterErr6) {
      console.log(" Aviso: problema ao tornar nome_completo nullable:", alterErr6.message);
    }
    try {
      var resultado7 = await sequelize.query("SHOW COLUMNS FROM `contratos`");
      var colunas7 = Array.isArray(resultado7[0]) ? resultado7[0] : resultado7;
      var nomes7 = colunas7.map(function(c) { return c.Field; });
      if (nomes7.indexOf("subsidio_alimentacao") === -1) {
        await sequelize.query("ALTER TABLE `contratos` ADD COLUMN `subsidio_alimentacao` DECIMAL(12,2) NULL");
        console.log(" Coluna 'subsidio_alimentacao' adicionada a contratos!");
      }
    } catch (alterErr7) {
      console.log(" Aviso: problema ao adicionar colunas de contratos:", alterErr7.message);
    }

    try {
      var resultado8 = await sequelize.query("SHOW COLUMNS FROM `seccoes`");
      var colunas8 = Array.isArray(resultado8[0]) ? resultado8[0] : resultado8;
      var nomes8 = colunas8.map(function(c) { return c.Field; });
      if (nomes8.indexOf("telefone") === -1) {
        await sequelize.query("ALTER TABLE `seccoes` ADD COLUMN `telefone` VARCHAR(20) NULL");
        console.log(" Coluna 'telefone' adicionada a seccoes!");
      }
      if (nomes8.indexOf("email") === -1) {
        await sequelize.query("ALTER TABLE `seccoes` ADD COLUMN `email` VARCHAR(150) NULL");
        console.log(" Coluna 'email' adicionada a seccoes!");
      }
      if (nomes8.indexOf("localizacao") === -1) {
        await sequelize.query("ALTER TABLE `seccoes` ADD COLUMN `localizacao` VARCHAR(200) NULL");
        console.log(" Coluna 'localizacao' adicionada a seccoes!");
      }
    } catch (alterErr8) {
      console.log(" Aviso: problema ao adicionar colunas de seccoes:", alterErr8.message);
    }

    try {
      var resultado9 = await sequelize.query("SHOW COLUMNS FROM `seccoes_colaboradores`");
      var colunas9 = Array.isArray(resultado9[0]) ? resultado9[0] : resultado9;
      var nomes9 = colunas9.map(function(c) { return c.Field; });
      if (nomes9.indexOf("funcao") !== -1) {
        await sequelize.query("ALTER TABLE `seccoes_colaboradores` MODIFY COLUMN `funcao` VARCHAR(100) NULL DEFAULT NULL");
        console.log(" Coluna 'funcao' de seccoes_colaboradores alterada para texto livre!");
      }
    } catch (alterErr9) {
      console.log(" Aviso: problema ao alterar coluna funcao de seccoes_colaboradores:", alterErr9.message);
    }

    try {
      var resultado10 = await sequelize.query("SHOW COLUMNS FROM `pedidos_colaborador` LIKE 'tipo'");
      var colunasTipo = Array.isArray(resultado10[0]) ? resultado10[0] : resultado10;
      if (colunasTipo.length > 0) {
        var tipoAtual = colunasTipo[0].Type || "";
        if (tipoAtual.indexOf("dispensa") === -1 || tipoAtual.indexOf("licenca") === -1) {
          await sequelize.query("ALTER TABLE `pedidos_colaborador` MODIFY COLUMN `tipo` ENUM('ferias','adiantamento','justificacao','aumento','dispensa','licenca','outro') NOT NULL");
          console.log(" Coluna 'tipo' de pedidos_colaborador expandida (dispensa, licenca)!");
        }
      }
    } catch (alterErr10) {
      console.log(" Aviso: problema ao expandir enum tipo de pedidos_colaborador:", alterErr10.message);
    }
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
  UtilizadorPerfil,
  Colaborador,
  Departamento,
  Cargo,
  Seccao,
  SeccaoMembro,
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
