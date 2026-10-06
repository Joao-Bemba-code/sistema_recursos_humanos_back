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

    // ==================== NOVO MODULO: CREDITOS ====================
    // Sem FKs a nivel de BD para compatibilidade com TiDB; a integridade e gerida pela app
    await sequelize.query(
      "CREATE TABLE IF NOT EXISTS `creditos` (" +
      "`id` CHAR(36) NOT NULL, " +
      "`colaborador_id` CHAR(36) NOT NULL, " +
      "`valor` DECIMAL(12,2) NOT NULL, " +
      "`desconto_mensal` DECIMAL(12,2) NOT NULL, " +
      "`valor_pago` DECIMAL(12,2) NOT NULL DEFAULT 0, " +
      "`data_concessao` DATE NOT NULL, " +
      "`motivo` TEXT NULL, " +
      "`estado` ENUM('Ativo','Pago','Cancelado') NOT NULL DEFAULT 'Ativo', " +
      "`criado_por` CHAR(36) NULL, " +
      "`createdAt` DATETIME NOT NULL, " +
      "`updatedAt` DATETIME NOT NULL, " +
      "PRIMARY KEY (`id`), " +
      "KEY `creditos_colaborador_idx` (`colaborador_id`), " +
      "KEY `creditos_estado_idx` (`estado`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
    console.log(" Tabela 'creditos' garantida!");

    await sequelize.query(
      "CREATE TABLE IF NOT EXISTS `creditos_movimentos` (" +
      "`id` CHAR(36) NOT NULL, " +
      "`credito_id` CHAR(36) NOT NULL, " +
      "`colaborador_id` CHAR(36) NOT NULL, " +
      "`pagamento_id` CHAR(36) NULL, " +
      "`mes` INT NOT NULL, " +
      "`ano` INT NOT NULL, " +
      "`valor_descontado` DECIMAL(12,2) NOT NULL, " +
      "`createdAt` DATETIME NOT NULL, " +
      "`updatedAt` DATETIME NOT NULL, " +
      "PRIMARY KEY (`id`), " +
      "UNIQUE KEY `creditos_movimentos_unique` (`credito_id`, `mes`, `ano`), " +
      "KEY `creditos_movimentos_colaborador_idx` (`colaborador_id`), " +
      "KEY `creditos_movimentos_pagamento_idx` (`pagamento_id`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
    console.log(" Tabela 'creditos_movimentos' garantida!");

    // ==================== NOVO MODULO: UTILIZADORES / PERFIS ====================
    // Garantir colunas do rbac nos utilizadores
    await adicionarColuna("utilizadores", "perfil_id", "CHAR(36) NULL");
    await adicionarColuna("utilizadores", "must_change_password", "BOOLEAN NOT NULL DEFAULT false");
    await adicionarColuna("utilizadores", "activo", "BOOLEAN NOT NULL DEFAULT true");

    // ==================== REGISTOS DE PRESENCA ====================
    await adicionarColuna("registos_presenca", "justificado", "BOOLEAN NOT NULL DEFAULT false");
    await adicionarColuna("registos_presenca", "documento_justificacao", "VARCHAR(500) NULL");
    await adicionarColuna("registos_presenca", "justificacao_observacoes", "TEXT NULL");
    await adicionarColuna("registos_presenca", "processada", "BOOLEAN NOT NULL DEFAULT false");
    await adicionarColuna("registos_presenca", "processada_mes", "INT NULL");
    await adicionarColuna("registos_presenca", "processada_ano", "INT NULL");
    // Registo corrigido a mao pelo RH: o biometro deixa de mexer nele
    await adicionarColuna("registos_presenca", "ajustado_manual", "BOOLEAN NOT NULL DEFAULT false");

    // ENUM 'estado': acrescenta 'Em_Curso' (dia a decorrer, ainda sem hora de saida)
    try {
      var rEstado = await sequelize.query("SHOW COLUMNS FROM `registos_presenca` LIKE 'estado'");
      var colEstado = Array.isArray(rEstado[0]) ? rEstado[0] : rEstado;
      if (colEstado.length && String(colEstado[0].Type || "").indexOf("Em_Curso") === -1) {
        await sequelize.query(
          "ALTER TABLE `registos_presenca` MODIFY COLUMN `estado` " +
          "ENUM('Presente','Ausente','Atrasado','Licenca','Ferias','Fim_semana','Em_Curso') " +
          "NULL DEFAULT 'Presente'"
        );
        console.log(" ENUM 'estado' com 'Em_Curso' garantido!");
      }
    } catch (eEstado) {
      console.log(" Aviso: nao foi possivel actualizar o ENUM 'estado':", eEstado.message);
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
      console.log(" Faltas/atrasos de meses ja processados marcados!");
    } catch (e) {
      console.log(" Aviso: backfill de faltas processadas:", e.message);
    }

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

    // ==================== AVISOS / COMUNICADOS ====================
    await adicionarColuna("avisos", "organizacao_id", "VARCHAR(36) NULL");
    await adicionarColuna("avisos", "criado_por", "VARCHAR(36) NULL");

    // ==================== COLABORADORES ====================
    await alterarColuna("colaboradores", "nome_completo", "VARCHAR(200) NULL");
    await adicionarColuna("colaboradores", "id_biometrico", "VARCHAR(30) NULL");
    await adicionarColuna("colaboradores", "dias_descanso", "VARCHAR(30) NULL DEFAULT '0,6'");

    // ==================== FERIADOS ====================
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
    console.log(" Tabela 'feriados' garantida!");

    // Seed dos feriados nacionais de Angola 2026 (so quando a tabela esta vazia;
    // se o RH apagar algum feriado, o arranque nao o volta a criar so por si)
    try {
      var [feriadosContagem] = await sequelize.query("SELECT COUNT(*) AS total FROM `feriados`");
      var totalFeriados = feriadosContagem && feriadosContagem.length ? parseInt(feriadosContagem[0].total, 10) : 0;
      if (totalFeriados === 0) {
        var feriadosAngola2026 = [
          ["2026-01-01", "Ano Novo"],
          ["2026-02-04", "Dia do Início da Luta Armada de Libertação Nacional"],
          ["2026-02-17", "Carnaval"],
          ["2026-03-08", "Dia Internacional da Mulher"],
          ["2026-04-03", "Sexta-Feira Santa"],
          ["2026-04-04", "Dia da Paz e da Reconciliação Nacional"],
          ["2026-05-01", "Dia Internacional do Trabalhador"],
          ["2026-09-17", "Dia do Fundador da Nação e do Herói Nacional"],
          ["2026-11-02", "Dia dos Finados"],
          ["2026-11-11", "Dia da Independência Nacional"],
          ["2026-12-25", "Natal"],
        ];
        for (var fi = 0; fi < feriadosAngola2026.length; fi++) {
          await sequelize.query(
            "INSERT INTO `feriados` (`id`, `data`, `descricao`, `createdAt`, `updatedAt`) VALUES (UUID(), ?, ?, NOW(), NOW())",
            { replacements: [feriadosAngola2026[fi][0], feriadosAngola2026[fi][1]] }
          );
        }
        console.log(" Feriados nacionais de Angola 2026 carregados!");
      }
    } catch (seedFeriadosErr) {
      console.log(" Aviso: problema ao carregar feriados:", seedFeriadosErr.message);
    }

    // ==================== ESCALAS SEMANAIS (turnos por colaborador) ====================
    // Sem FKs a nivel de BD para compatibilidade com TiDB. hora_entrada/hora_saida
    // preenchidas = dia de trabalho; ambas vazias = descanso. Podem passar da
    // meia-noite (ex.: 20:00-04:00, saida no dia seguinte).
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
    console.log(" Tabela 'escalas_semanais' garantida!");

    // ==================== BIOMETRO: picagens da ponte ZKTeco ====================
    // Sem FKs a nivel de BD para compatibilidade com TiDB
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
    console.log(" Tabela 'picagens_biometrico' garantida!");

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

    // ==================== ANEXOS DE COMUNICADOS (guardados na BD) ====================
    // Os documentos ficam na base de dados (base64) para sobreviverem aos
    // reinicios/deploys da instancia gratuita do Render (o disco e volatil).
    await sequelize.query(
      "CREATE TABLE IF NOT EXISTS `comunicado_anexos` (" +
      "`id` CHAR(36) NOT NULL, " +
      "`comunicado_id` CHAR(36) NOT NULL, " +
      "`nome` VARCHAR(255) NOT NULL, " +
      "`tipo` VARCHAR(150) NULL, " +
      "`tamanho` INT NULL, " +
      "`dados` LONGTEXT NOT NULL, " +
      "`createdAt` DATETIME NOT NULL, " +
      "`updatedAt` DATETIME NOT NULL, " +
      "PRIMARY KEY (`id`), " +
      "KEY `comunicado_anexos_comunicado_idx` (`comunicado_id`)" +
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci"
    );
    console.log(" Tabela 'comunicado_anexos' garantida!");

    // ==================== PERFIL COLABORADOR: minimo garantido (uma vez) ====================
    // Ate agora o login forjava permissoes minimas para o perfil "Colaborador"
    // (independentemente da BD). Esse forjamento foi removido: a matriz da BD
    // passa a ser respeitada. Para nao reabrir a vulnerabilidade do portal,
    // aplica-se UMA vez o minimo ao perfil "Colaborador" e marca-se com
    // minimo_aplicado=1; a partir dai o RH gere o perfil livremente.
    await adicionarColuna("perfis", "minimo_aplicado", "BOOLEAN NOT NULL DEFAULT false");
    try {
      var [colabLinhas] = await sequelize.query(
        "SELECT `id`, `permissoes`, `minimo_aplicado` FROM `perfis` WHERE `nome` = 'Colaborador' LIMIT 1"
      );
      var colab = colabLinhas && colabLinhas.length ? colabLinhas[0] : null;
      if (colab && !colab.minimo_aplicado) {
        await sequelize.query(
          "UPDATE `perfis` SET `permissoes` = ?, `minimo_aplicado` = 1 WHERE `id` = ?",
          {
            replacements: [
              JSON.stringify({ portal: ["read", "update"], ferias: ["create", "read"] }),
              colab.id,
            ],
          }
        );
        console.log(" Perfil 'Colaborador' reposto ao minimo (uma unica vez)!");
      }
    } catch (e) {
      console.log(" Aviso: problema ao repor o perfil 'Colaborador':", e.message);
    }

    // ==================== MODULO TAREFAS: permissoes por perfil ====================
    // Todos os perfis precisam de VER as tarefas e ACTUALIZAR o progresso das
    // suas (o controller restringe ao proprio colaborador quando nao e gestor).
    // Os perfis de gestao recebem tambem "create" e "delete" (atribuir,
    // validar, eliminar). Acrescenta-se apenas o que falta - idempotente.
    try {
      var NOMES_GESTOR_TAREFAS = [
        "administrador geral",
        "director geral",
        "director de recursos humanos",
        "técnico de rh",
        "tecnico de rh",
      ];
      var [todosPerfis] = await sequelize.query(
        "SELECT `id`, `nome`, `nivel`, `permissoes` FROM `perfis`"
      );
      for (var pi = 0; pi < todosPerfis.length; pi++) {
        var perfilT = todosPerfis[pi];
        var permT = perfilT.permissoes;
        if (typeof permT === "string") {
          try { permT = JSON.parse(permT); } catch (eParseT) { permT = {}; }
        }
        if (!permT || typeof permT !== "object" || Array.isArray(permT)) permT = {};
        var opsT = Array.isArray(permT.tarefas) ? permT.tarefas.slice() : [];
        var desejadas = ["read", "update"];
        var ehGestorT = (perfilT.nivel || 0) >= 2 ||
          NOMES_GESTOR_TAREFAS.indexOf(String(perfilT.nome).toLowerCase()) !== -1;
        if (ehGestorT) desejadas = desejadas.concat(["create", "delete"]);
        var mudouT = false;
        desejadas.forEach(function (op) {
          if (opsT.indexOf(op) === -1) {
            opsT.push(op);
            mudouT = true;
          }
        });
        if (mudouT) {
          permT.tarefas = opsT;
          await sequelize.query(
            "UPDATE `perfis` SET `permissoes` = ? WHERE `id` = ?",
            { replacements: [JSON.stringify(permT), perfilT.id] }
          );
          console.log(" Perfil '" + perfilT.nome + "' recebeu acesso ao modulo de tarefas!");
        }
      }
    } catch (eTarefas) {
      console.log(" Aviso: problema ao conceder permissoes de tarefas:", eTarefas.message);
    }

    // ==================== TAREFAS: prazo com hora e atraso em minutos ====================
    await adicionarColuna("tarefas", "prazo_hora", "TIME NULL");
    await adicionarColuna("tarefas", "atraso_minutos", "INT NOT NULL DEFAULT 0");
    console.log(" Colunas 'prazo_hora'/'atraso_minutos' em tarefas garantidas!");

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