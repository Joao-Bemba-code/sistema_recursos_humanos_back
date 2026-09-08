var { sequelize } = require("./config");
var { sequelize: syncModel } = require("./models");

// Utilitários idempotentes
var colunasDaTabela = async function (tabela) {
  try {
    var resultado = await sequelize.query("SHOW COLUMNS FROM `" + tabela + "`");
    var linhas = Array.isArray(resultado[0]) ? resultado[0] : resultado;
    return linhas.map(function (c) { return c.Field; });
  } catch (e) {
    return null;
  }
};

var adicionarColuna = async function (tabela, coluna, definicao) {
  var nomes = await colunasDaTabela(tabela);
  if (nomes && nomes.indexOf(coluna) === -1) {
    await sequelize.query("ALTER TABLE `" + tabela + "` ADD COLUMN `" + coluna + "` " + definicao);
    console.log(" Coluna '" + coluna + "' adicionada a " + tabela + "!");
  }
};

var alterarColuna = async function (tabela, coluna, definicao) {
  var nomes = await colunasDaTabela(tabela);
  if (nomes && nomes.indexOf(coluna) !== -1) {
    await sequelize.query("ALTER TABLE `" + tabela + "` MODIFY COLUMN `" + coluna + "` " + definicao);
    console.log(" Coluna '" + coluna + "' alterada em " + tabela + "!");
  }
};

var migrations = async function () {
  try {
    await sequelize.authenticate();
    console.log(" A executar migracoes da base de dados...");

    // Garantir que as tabelas existem (cria apenas as que faltam)
    await syncModel.sync();
    console.log(" Tabelas sincronizadas.");

    // ==================== MULTI-PERFIS: tabela utilizadores_perfis ====================
    // Sem FKs a nivel de BD para compatibilidade com TiDB; a integridade e gerida pela app
    await sequelize.query(
      "CREATE TABLE IF NOT EXISTS `utilizadores_perfis` (" +
      "`utilizador_id` CHAR(36) NOT NULL, " +
      "`perfil_id` CHAR(36) NOT NULL, " +
      "`createdAt` DATETIME NOT NULL, " +
      "`updatedAt` DATETIME NOT NULL, " +
      "PRIMARY KEY (`utilizador_id`, `perfil_id`), " +
      "KEY `utilizadores_perfis_perfil_idx` (`perfil_id`), " +
      "KEY `utilizadores_perfis_utilizador_idx` (`utilizador_id`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
    console.log(" Tabela 'utilizadores_perfis' garantida!");

    // ==================== PERFIS: garantir coluna JSON ====================
    try {
      await sequelize.query("ALTER TABLE `perfis` MODIFY COLUMN `permissoes` JSON NULL");
      console.log(" Coluna 'permissoes' de perfis convertida para JSON!");
    } catch (e) {
      console.log(" Aviso: nao foi possivel converter permissoes para JSON:", e.message);
    }

    // ==================== NOVO MODULO: ADVERTENCIAS ====================
    // Tabela de ocorrencias disciplinares (model OcorrenciaDisciplinar)
    await sequelize.query(
      "CREATE TABLE IF NOT EXISTS `ocorrencias_disciplinares` (" +
      "`id` CHAR(36) NOT NULL, " +
      "`numero` VARCHAR(30) NOT NULL, " +
      "`colaborador_id` CHAR(36) NULL, " +
      "`tipo` ENUM('Advertencia','Suspenso','Reprovacao','Despedimento','Outra') NOT NULL, " +
      "`data_ocorrencia` DATE NOT NULL, " +
      "`descricao` TEXT NOT NULL, " +
      "`testemunhas` TEXT NULL, " +
      "`providencias` TEXT NULL, " +
      "`penalidade` TEXT NULL, " +
      "`duracao_suspensao` INT NULL, " +
      "`estado` ENUM('Registada','Em_analise','Resolvida','Arquivada') DEFAULT 'Registada', " +
      "`registado_por` CHAR(36) NULL, " +
      "`documento` VARCHAR(500) NULL, " +
      "`createdAt` DATETIME NOT NULL, " +
      "`updatedAt` DATETIME NOT NULL, " +
      "PRIMARY KEY (`id`), " +
      "UNIQUE KEY `ocorrencias_numero_unique` (`numero`), " +
      "KEY `ocorrencias_colaborador_fk` (`colaborador_id`), " +
      "CONSTRAINT `ocorrencias_colaborador_fk` FOREIGN KEY (`colaborador_id`) REFERENCES `colaboradores` (`id`) ON DELETE SET NULL ON UPDATE CASCADE" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
    console.log(" Tabela 'ocorrencias_disciplinares' garantida!");

    // ==================== NOVO MODULO: UTILIZADORES / PERFIS ====================
    // Garantir colunas do rbac nos utilizadores
    await adicionarColuna("utilizadores", "perfil_id", "CHAR(36) NULL");
    await adicionarColuna("utilizadores", "must_change_password", "BOOLEAN NOT NULL DEFAULT false");
    await adicionarColuna("utilizadores", "activo", "BOOLEAN NOT NULL DEFAULT true");

    // ==================== REGISTOS DE PRESENCA ====================
    await adicionarColuna("registos_presenca", "justificado", "BOOLEAN NOT NULL DEFAULT false");
    await adicionarColuna("registos_presenca", "documento_justificacao", "VARCHAR(500) NULL");
    await adicionarColuna("registos_presenca", "justificacao_observacoes", "TEXT NULL");

    // ==================== PAGAMENTOS ====================
    await adicionarColuna("pagamentos", "desconto_faltas", "DECIMAL(12,2) DEFAULT 0");
    await adicionarColuna("pagamentos", "data_pagamento", "DATE NULL");
    await adicionarColuna("pagamentos", "recibo", "VARCHAR(500) NULL");

    // ==================== ORGANIZACOES ====================
    await adicionarColuna("organizacoes", "template_contrato", "TEXT NULL");
    await adicionarColuna("organizacoes", "logo_url", "VARCHAR(500) NULL");

    // ==================== VENCIMENTOS ====================
    await adicionarColuna("vencimentos", "colaborador_id", "VARCHAR(36) NULL");

    // ==================== PEDIDOS ====================
    await adicionarColuna("pedidos_colaborador", "documento", "VARCHAR(500) NULL");

    // ==================== NOTIFICACOES: separacao por modulo ====================
    await adicionarColuna("notificacoes", "modulo", "VARCHAR(50) NULL");

    // ==================== COLABORADORES ====================
    await alterarColuna("colaboradores", "nome_completo", "VARCHAR(200) NULL");

    // ==================== CONTRATOS ====================
    await adicionarColuna("contratos", "subsidio_alimentacao", "DECIMAL(12,2) NULL");

    // ==================== SECCOES ====================
    await adicionarColuna("seccoes", "telefone", "VARCHAR(20) NULL");
    await adicionarColuna("seccoes", "email", "VARCHAR(150) NULL");
    await adicionarColuna("seccoes", "localizacao", "VARCHAR(200) NULL");

    // ==================== SECCOES_COLABORADORES ====================
    await alterarColuna("seccoes_colaboradores", "funcao", "VARCHAR(100) NULL DEFAULT NULL");

    // ==================== ENUM TIPO DE PEDIDOS ====================
    try {
      var tiposPedidos = await sequelize.query("SHOW COLUMNS FROM `pedidos_colaborador` LIKE 'tipo'");
      var linhasTipo = Array.isArray(tiposPedidos[0]) ? tiposPedidos[0] : tiposPedidos;
      if (linhasTipo.length > 0) {
        var tipoAtual = linhasTipo[0].Type || "";
        if (tipoAtual.indexOf("dispensa") === -1 || tipoAtual.indexOf("licenca") === -1) {
          await sequelize.query("ALTER TABLE `pedidos_colaborador` MODIFY COLUMN `tipo` ENUM('ferias','adiantamento','justificacao','aumento','dispensa','licenca','outro') NOT NULL");
          console.log(" Enum 'tipo' de pedidos_colaborador expandido (dispensa, licenca)!");
        }
      }
    } catch (e) {
      console.log(" Aviso: problema ao expandir enum tipo de pedidos_colaborador:", e.message);
    }

    console.log(" Migracoes concluidas com sucesso!");
  } catch (e) {
    console.log(" Erro nas migracoes:", e.message);
    throw e;
  }
};

module.exports = migrations;

if (require.main === module) {
  migrations()
    .then(function () {
      process.exit(0);
    })
    .catch(function (e) {
      console.log(e);
      process.exit(1);
    });
}