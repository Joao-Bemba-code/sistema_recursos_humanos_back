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
var { Credito, CreditoMovimento } = require("./Credito");
var { PicagemBiometrico } = require("./Biometro");
var Feriado = require("./Feriado");
var EscalaSemanal = require("./EscalaSemanal");
var { Aviso } = require("./Comunicacao");
var { ComunicacaoAnexo } = require("./ComunicacaoAnexo");
var Notificacao = require("./Notificacao");
var PedidoColaborador = require("./PedidoColaborador");
var Ficheiro = require("./Ficheiro");
var { Tarefa, TarefaEvento, TarefaAlocacao } = require("./Tarefa");
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

// Colaborador -> Creditos (sem FKs a nivel de BD para compatibilidade com TiDB)
Colaborador.hasMany(Credito, { foreignKey: "colaborador_id", as: "creditos", constraints: false });
Credito.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador", constraints: false });

// Credito -> Movimentos
Credito.hasMany(CreditoMovimento, { foreignKey: "credito_id", as: "movimentos", constraints: false });
CreditoMovimento.belongsTo(Credito, { foreignKey: "credito_id", as: "credito", constraints: false });

// Colaborador -> Movimentos de Credito
Colaborador.hasMany(CreditoMovimento, { foreignKey: "colaborador_id", as: "movimentos_credito", constraints: false });
CreditoMovimento.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador", constraints: false });

// Pagamento -> Movimentos de Credito
Pagamento.hasMany(CreditoMovimento, { foreignKey: "pagamento_id", as: "movimentos_credito", constraints: false });
CreditoMovimento.belongsTo(Pagamento, { foreignKey: "pagamento_id", as: "pagamento", constraints: false });

// PicagemBiometrico -> Colaborador (sem FK a nivel de BD, compatibilidade TiDB)
PicagemBiometrico.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador", constraints: false });
Colaborador.hasMany(PicagemBiometrico, { foreignKey: "colaborador_id", as: "picagens_biometrico", constraints: false });

// Colaborador -> Escala semanal (sem FK a nivel de BD, compatibilidade TiDB)
Colaborador.hasMany(EscalaSemanal, { foreignKey: "colaborador_id", as: "escalas_semanais", constraints: false });
EscalaSemanal.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador", constraints: false });

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

// Aviso -> Organizacao
Organizacao.hasMany(Aviso, { foreignKey: "organizacao_id", as: "avisos" });
Aviso.belongsTo(Organizacao, { foreignKey: "organizacao_id", as: "organizacao" });

// Aviso -> Utilizador (criado_por)
Utilizador.hasMany(Aviso, { foreignKey: "criado_por", as: "avisos_criados" });
Aviso.belongsTo(Utilizador, { foreignKey: "criado_por", as: "criador" });

// Aviso -> Departamento
Departamento.hasMany(Aviso, { foreignKey: "departamento_id", as: "avisos" });
Aviso.belongsTo(Departamento, { foreignKey: "departamento_id", as: "departamento" });

// Aviso -> Anexos (guardados na BD). Sem FK a nivel de BD (TiDB).
Aviso.hasMany(ComunicacaoAnexo, { foreignKey: "comunicado_id", as: "anexos", constraints: false });
ComunicacaoAnexo.belongsTo(Aviso, { foreignKey: "comunicado_id", as: "comunicado", constraints: false });

// LogAuditoria -> Utilizador
Utilizador.hasMany(LogAuditoria, { foreignKey: "utilizador_id", as: "logs" });
LogAuditoria.belongsTo(Utilizador, { foreignKey: "utilizador_id", as: "utilizador" });

// ==================== TAREFAS (gestao de tarefas) ====================
// Sem FKs a nivel de BD para compatibilidade com TiDB.
Colaborador.hasMany(Tarefa, { foreignKey: "colaborador_id", as: "tarefas", constraints: false });
Tarefa.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador", constraints: false });

Utilizador.hasMany(Tarefa, { foreignKey: "atribuido_por", as: "tarefas_atribuidas", constraints: false });
Tarefa.belongsTo(Utilizador, { foreignKey: "atribuido_por", as: "atribuidor", constraints: false });

Tarefa.hasMany(TarefaEvento, { foreignKey: "tarefa_id", as: "eventos", constraints: false });
TarefaEvento.belongsTo(Tarefa, { foreignKey: "tarefa_id", as: "tarefa", constraints: false });
TarefaEvento.belongsTo(Utilizador, { foreignKey: "utilizador_id", as: "utilizador", constraints: false });

// Cada colaborador atribuido tem a sua propria janela e avaliacao
Tarefa.hasMany(TarefaAlocacao, { foreignKey: "tarefa_id", as: "alocacoes", constraints: false });
TarefaAlocacao.belongsTo(Tarefa, { foreignKey: "tarefa_id", as: "tarefa", constraints: false });
TarefaAlocacao.belongsTo(Colaborador, { foreignKey: "colaborador_id", as: "colaborador", constraints: false });
Colaborador.hasMany(TarefaAlocacao, { foreignKey: "colaborador_id", as: "alocacoes", constraints: false });
TarefaAlocacao.belongsTo(Utilizador, { foreignKey: "atribuido_por", as: "atribuidor", constraints: false });
TarefaAlocacao.belongsTo(Utilizador, { foreignKey: "avaliado_por", as: "avaliador", constraints: false });

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
      if (nomesColunas.indexOf("processada") === -1) {
        await sequelize.query("ALTER TABLE `registos_presenca` ADD COLUMN `processada` BOOLEAN NOT NULL DEFAULT false");
        console.log(" Coluna 'processada' adicionada!");
      }
      if (nomesColunas.indexOf("processada_mes") === -1) {
        await sequelize.query("ALTER TABLE `registos_presenca` ADD COLUMN `processada_mes` INT NULL");
        console.log(" Coluna 'processada_mes' adicionada!");
      }
      if (nomesColunas.indexOf("processada_ano") === -1) {
        await sequelize.query("ALTER TABLE `registos_presenca` ADD COLUMN `processada_ano` INT NULL");
        console.log(" Coluna 'processada_ano' adicionada!");
      }
      if (nomesColunas.indexOf("ajustado_manual") === -1) {
        await sequelize.query("ALTER TABLE `registos_presenca` ADD COLUMN `ajustado_manual` BOOLEAN NOT NULL DEFAULT false");
        console.log(" Coluna 'ajustado_manual' adicionada!");
      }
      // ENUM de estados: acrescenta 'Em_Curso' (dia a decorrer, ainda sem hora de saida)
      var rEstado = await sequelize.query("SHOW COLUMNS FROM `registos_presenca` LIKE 'estado'");
      var linhasEstado = Array.isArray(rEstado[0]) ? rEstado[0] : rEstado;
      var tipoEstado = linhasEstado.length ? String(linhasEstado[0].Type || "") : "";
      if (tipoEstado && tipoEstado.indexOf("Em_Curso") === -1) {
        await sequelize.query(
          "ALTER TABLE `registos_presenca` MODIFY COLUMN `estado` " +
          "ENUM('Presente','Ausente','Atrasado','Licenca','Ferias','Fim_semana','Em_Curso') " +
          "NULL DEFAULT 'Presente'"
        );
        console.log(" ENUM 'estado' com 'Em_Curso' garantido!");
      }
    } catch (alterErr) {
      console.log(" Aviso: problema ao adicionar colunas de justificacao:", alterErr.message);
    }

    // Backfill idempotente: faltas/atrasos de meses que ja tem pagamento
    // ficam marcados como processados (comportamento antigo de "mes processado")
    try {
      await sequelize.query(
        "UPDATE `registos_presenca` rp " +
        "INNER JOIN `pagamentos` p ON p.colaborador_id = rp.colaborador_id " +
        "AND p.mes = MONTH(rp.data) AND p.ano = YEAR(rp.data) " +
        "SET rp.processada = 1, rp.processada_mes = p.mes, rp.processada_ano = p.ano " +
        "WHERE rp.processada = 0 AND rp.estado IN ('Ausente', 'Atrasado') AND rp.justificado = 0"
      );
      console.log(" Backfill de faltas processadas verificado!");
    } catch (backfillErr) {
      console.log(" Aviso: backfill de faltas processadas:", backfillErr.message);
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
      if (nomes6.indexOf("id_biometrico") === -1) {
        await sequelize.query("ALTER TABLE `colaboradores` ADD COLUMN `id_biometrico` VARCHAR(30) NULL");
        console.log(" Coluna 'id_biometrico' adicionada!");
      }
      if (nomes6.indexOf("dias_descanso") === -1) {
        await sequelize.query("ALTER TABLE `colaboradores` ADD COLUMN `dias_descanso` VARCHAR(30) NULL DEFAULT '0,6'");
        console.log(" Coluna 'dias_descanso' adicionada!");
      }
    } catch (alterErr6) {
      console.log(" Aviso: problema ao tornar nome_completo nullable:", alterErr6.message);
    }

    // Tabela de picagens do biometro (fallback caso as migracoes falhem)
    try {
      await sequelize.query(
        "CREATE TABLE IF NOT EXISTS `picagens_biometrico` (" +
        "`id` CHAR(36) NOT NULL, " +
        "`id_biometrico` VARCHAR(30) NOT NULL, " +
        "`colaborador_id` CHAR(36) NULL, " +
        "`data_hora` DATETIME NOT NULL, " +
        "`tipo` INT NULL, " +
        "`raw` VARCHAR(500) NULL, " +
        "`processada` BOOLEAN NOT NULL DEFAULT false, " +
        "`createdAt` DATETIME NOT NULL, " +
        "`updatedAt` DATETIME NOT NULL, " +
        "PRIMARY KEY (`id`), " +
        "UNIQUE KEY `picagens_biometrico_unique` (`id_biometrico`, `data_hora`), " +
        "KEY `picagens_colaborador_idx` (`colaborador_id`), " +
        "KEY `picagens_processada_idx` (`processada`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
      );
    } catch (picErr) {
      console.log(" Aviso: problema ao garantir tabela picagens_biometrico:", picErr.message);
    }

    // Tabela de feriados (fallback caso as migracoes falhem): dias em que o
    // biometro nao marca ninguem como Ausente.
    try {
      await sequelize.query(
        "CREATE TABLE IF NOT EXISTS `feriados` (" +
        "`id` CHAR(36) NOT NULL, " +
        "`data` DATE NOT NULL, " +
        "`descricao` VARCHAR(200) NULL, " +
        "`organizacao_id` CHAR(36) NULL, " +
        "`createdAt` DATETIME NOT NULL, " +
        "`updatedAt` DATETIME NOT NULL, " +
        "PRIMARY KEY (`id`), " +
        "UNIQUE KEY `feriados_data_unique` (`data`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
      );
    } catch (feriadoErr) {
      console.log(" Aviso: problema ao garantir tabela feriados:", feriadoErr.message);
    }

    // Tabela de escalas semanais (fallback caso as migracoes falhem): horario
    // de entrada/saida por colaborador e dia da semana (turnos e escalas).
    try {
      await sequelize.query(
        "CREATE TABLE IF NOT EXISTS `escalas_semanais` (" +
        "`id` CHAR(36) NOT NULL, " +
        "`colaborador_id` CHAR(36) NOT NULL, " +
        "`dia_semana` INT NOT NULL, " +
        "`hora_entrada` VARCHAR(5) NULL, " +
        "`hora_saida` VARCHAR(5) NULL, " +
        "`createdAt` DATETIME NOT NULL, " +
        "`updatedAt` DATETIME NOT NULL, " +
        "PRIMARY KEY (`id`), " +
        "UNIQUE KEY `escalas_semanais_unique` (`colaborador_id`, `dia_semana`), " +
        "KEY `escalas_colaborador_idx` (`colaborador_id`)" +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
      );
    } catch (escalaErr) {
      console.log(" Aviso: problema ao garantir tabela escalas_semanais:", escalaErr.message);
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

    try {
      var resultadoNotif = await sequelize.query("SHOW COLUMNS FROM `notificacoes`");
      var colunasNotif = Array.isArray(resultadoNotif[0]) ? resultadoNotif[0] : resultadoNotif;
      var nomesNotif = colunasNotif.map(function(c) { return c.Field; });
      if (nomesNotif.indexOf("modulo") === -1) {
        await sequelize.query("ALTER TABLE `notificacoes` ADD COLUMN `modulo` VARCHAR(50) NULL");
        console.log(" Coluna 'modulo' adicionada a notificacoes!");
      }
    } catch (alterErrNotif) {
      console.log(" Aviso: problema ao adicionar colunas de notificacoes:", alterErrNotif.message);
    }

    try {
      var resultadoAvisos = await sequelize.query("SHOW COLUMNS FROM `avisos`");
      var colunasAvisos = Array.isArray(resultadoAvisos[0]) ? resultadoAvisos[0] : resultadoAvisos;
      var nomesAvisos = colunasAvisos.map(function(c) { return c.Field; });
      if (nomesAvisos.indexOf("organizacao_id") === -1) {
        await sequelize.query("ALTER TABLE `avisos` ADD COLUMN `organizacao_id` VARCHAR(36) NULL");
        console.log(" Coluna 'organizacao_id' adicionada a avisos!");
      }
      if (nomesAvisos.indexOf("criado_por") === -1) {
        await sequelize.query("ALTER TABLE `avisos` ADD COLUMN `criado_por` VARCHAR(36) NULL");
        console.log(" Coluna 'criado_por' adicionada a avisos!");
      }
    } catch (alterErrAvisos) {
      console.log(" Aviso: problema ao adicionar colunas de avisos:", alterErrAvisos.message);
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
  Credito,
  CreditoMovimento,
  PicagemBiometrico,
  Feriado,
  EscalaSemanal,
  Aviso,
  ComunicacaoAnexo,
  Notificacao,
  PedidoColaborador,
  Ficheiro,
  Tarefa,
  TarefaEvento,
  TarefaAlocacao,
  LogAuditoria,
};
