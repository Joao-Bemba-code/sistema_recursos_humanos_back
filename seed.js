var { Organizacao, Perfil, Utilizador, Colaborador, Notificacao, PedidoColaborador, syncDatabase, sequelize } = require("./models");

var perfisPadrao = [
  {
    nome: "Administrador Geral",
    descricao: "Acesso total ao sistema. Configuração de organização, utilizadores e todos os módulos.",
    nivel: 4,
    permissoes: { _all: ["create", "read", "update", "delete"] },
  },
  {
    nome: "Director Geral",
    descricao: "Acesso de leitura a todos os módulos. Aprovações e decisões estratégicas.",
    nivel: 3,
    permissoes: { _all: ["read"], dashboard: ["read", "export"], relatorios: ["read", "export"] },
  },
  {
    nome: "Director de Recursos Humanos",
    descricao: "Gestão completa do módulo de RH. Colaboradores, contratos, férias, avaliação.",
    nivel: 3,
    permissoes: {
      colaboradores: ["create", "read", "update", "delete"],
      contratos: ["create", "read", "update", "delete"],
      ferias: ["create", "read", "update", "delete"],
      licencas: ["create", "read", "update", "delete"],
      avaliacao: ["create", "read", "update", "delete"],
      assiduidade: ["create", "read", "update", "delete"],
      recrutamento: ["create", "read", "update", "delete"],
      disciplinar: ["create", "read", "update", "delete"],
      folha_salarial: ["create", "read", "update", "delete"],
      formacao: ["create", "read", "update", "delete"],
      relatorios: ["read", "export"],
    },
  },
  {
    nome: "Técnico de RH",
    descricao: "Operações CRUD nos módulos de RH. Registo de colaboradores, processamento de férias.",
    nivel: 2,
    permissoes: {
      colaboradores: ["create", "read", "update"],
      contratos: ["create", "read", "update"],
      ferias: ["read", "update"],
      licencas: ["read", "update"],
      assiduidade: ["create", "read", "update"],
      relatorios: ["read"],
    },
  },
  {
    nome: "Director Pedagógico",
    descricao: "Gestão de formadores, cursos e actividades formativas.",
    nivel: 3,
    permissoes: {
      formadores: ["create", "read", "update", "delete"],
      formacao: ["create", "read", "update", "delete"],
      avaliacao: ["read", "update"],
      relatorios: ["read", "export"],
    },
  },
  {
    nome: "Coordenador de Formação",
    descricao: "Gestão de inscrições, cursos e avaliação de formação.",
    nivel: 2,
    permissoes: {
      formacao: ["create", "read", "update"],
      formadores: ["read"],
      relatorios: ["read"],
    },
  },
  {
    nome: "Coordenador de Curso",
    descricao: "Gestão do curso específico, formadores atribuídos e alunos.",
    nivel: 2,
    permissoes: {
      formacao: ["read", "update"],
      formadores: ["read"],
    },
  },
  {
    nome: "Formador",
    descricao: "Acesso às suas turmas, registo de presença e avaliação.",
    nivel: 1,
    permissoes: {
      formacao: ["read"],
      assiduidade: ["create", "read"],
      avaliacao: ["read", "update"],
    },
  },
  {
    nome: "Funcionário Administrativo",
    descricao: "Acesso ao departamento próprio e documentos.",
    nivel: 1,
    permissoes: {
      comunicacao: ["read"],
      documental: ["read"],
    },
  },
  {
    nome: "Financeiro",
    descricao: "Gestão de folha salarial, benefícios e pagamentos.",
    nivel: 2,
    permissoes: {
      folha_salarial: ["create", "read", "update", "delete"],
      beneficios: ["create", "read", "update", "delete"],
      relatorios: ["read", "export"],
    },
  },
  {
    nome: "Contabilidade",
    descricao: "Relatórios financeiros e mapas salariais.",
    nivel: 2,
    permissoes: {
      folha_salarial: ["read"],
      relatorios: ["read", "export"],
    },
  },
  {
    nome: "Auditor",
    descricao: "Leitura global do sistema e logs de auditoria.",
    nivel: 2,
    permissoes: { _all: ["read"], auditoria: ["read"] },
  },
  {
    nome: "Colaborador",
    descricao: "Portal do colaborador. Dados pessoais, férias, documentos.",
    nivel: 0,
    permissoes: {
      portal: ["read", "update"],
      ferias: ["create", "read"],
      licencas: ["create", "read"],
      comunicacao: ["read"],
    },
  },
];

var seed = async function () {
  try {
    // Connect first so we can check tables
    await sequelize.authenticate();

    // Verificar tabela notificacoes antes do sync
    try {
      var [cols] = await sequelize.query("SHOW COLUMNS FROM notificacoes LIKE 'organizacao_id'");
      if (cols.length === 0) {
        await sequelize.query("DROP TABLE notificacoes");
        console.log(" Tabela notificacoes antiga removida, sera recriada...");
      }
    } catch (e) {
      // Tabela nao existe, tudo bem - sync vai criar
    }

    await sequelize.sync();
    console.log(" A sincronizar dados iniciais...");

    var org = await Organizacao.findOne({ where: { nif: "5417279310" } });
    if (!org) {
      org = await Organizacao.findOne({ where: { nome: "Centro de Formação Profissional CENFFOR" } });
    }
    if (!org) {
      org = await Organizacao.create({
        nome: "Centro de Formação Profissional CENFFOR",
        nome_curto: "CENFFOR",
        nif: "5417279310",
        email: "geral@cenffor.co.ao",
        telefone: "+244 923 456 789",
        cidade: "Luanda",
        provincia: "Luanda",
        pais: "Angola",
        dominio: "cenffor",
      });
      console.log(" Organização CENFFOR criada!");
    }

    var perfisCriados = 0;
    for (var i = 0; i < perfisPadrao.length; i++) {
      var p = perfisPadrao[i];
      var existente = await Perfil.findOne({ where: { nome: p.nome } });
      if (!existente) {
        await Perfil.create(p);
        perfisCriados++;
      }
    }
    if (perfisCriados > 0) {
      console.log(" " + perfisCriados + " perfis criados!");
    }

    var adminPerfil = await Perfil.findOne({ where: { nome: "Administrador Geral" } });
    var adminExiste = await Utilizador.findOne({ where: { username: "admin" } });
    if (!adminExiste && adminPerfil) {
      await Utilizador.create({
        nome_completo: "Administrador do Sistema",
        email: "admin@cenffor.co.ao",
        username: "admin",
        password: "admin123",
        telefone: "+244 900 000 000",
        organizacao_id: org.id,
        perfil_id: adminPerfil.id,
        activo: true,
        must_change_password: true,
      });
      console.log(" Utilizador admin criado! (admin / admin123)");
    }

    console.log(" Seed concluido com sucesso!");

    // Criar utilizador colaborador (antes das notificacoes para nao bloquear)
    var admin = await Utilizador.findOne({ where: { username: "admin" } });
    var colaboradorPerfil = await Perfil.findOne({ where: { nome: "Colaborador" } });
    if (colaboradorPerfil) {
      var colaboradorUser = await Utilizador.findOne({ where: { username: "maria" } });
      if (!colaboradorUser) {
        colaboradorUser = await Utilizador.create({
          nome_completo: "Maria Fernanda Santos",
          email: "maria.santos@cenffor.co.ao",
          username: "maria",
          password: "colaborador123",
          telefone: "+244 923 111 222",
          organizacao_id: org.id,
          perfil_id: colaboradorPerfil.id,
          activo: true,
          must_change_password: false,
        });
        console.log(" Utilizador colaborador criado! (maria.santos@cenffor.co.ao / colaborador123)");
      }

      var colaboradorExiste = await Colaborador.findOne({ where: { organizacao_id: org.id } });
      if (!colaboradorExiste) {
        var novoColaborador = await Colaborador.create({
          numero_colaborador: "COL001",
          nome_completo: "Maria Fernanda Santos",
          email_institucional: "maria.santos@cenffor.co.ao",
          telefone: "+244 923 111 222",
          data_admissao: "2024-01-15",
          tipo_colaborador: "Interno",
          estado: "Activo",
          organizacao_id: org.id,
          utilizador_id: colaboradorUser.id,
        });
        console.log(" Registo de colaborador criado!");
      }
    }

    // Notificacoes de exemplo (try/catch separado para nao bloquear o resto)
    try {
      if (admin) {
        var notificacaoExiste = await Notificacao.findOne({ where: { utilizador_id: admin.id } });
        if (!notificacaoExiste) {
          await Notificacao.bulkCreate([
            {
              organizacao_id: org.id,
              utilizador_id: admin.id,
              titulo: "Bem-vindo ao Sistema",
              mensagem: "Conta criada com sucesso. Altere a sua senha no primeiro acesso.",
              tipo: "info",
              lida: false,
            },
            {
              organizacao_id: org.id,
              utilizador_id: admin.id,
              titulo: "Actualizacao de Seguranca",
              mensagem: "O sistema foi actualizado com novas funcionalidades de seguranca.",
              tipo: "warning",
              lida: false,
            },
            {
              organizacao_id: org.id,
              utilizador_id: admin.id,
              titulo: "Backup Concluido",
              mensagem: "O backup automatico da base de dados foi concluido com sucesso.",
              tipo: "success",
              lida: true,
            },
          ]);
          console.log(" Notificacoes de exemplo criadas!");
        }
      }
    } catch (e) {
      console.log(" Aviso: Nao foi possivel criar notificacoes:", e.message);
    }

    // Pedidos de exemplo (try/catch separado)
    try {
      var colaboradorLink = await Colaborador.findOne({ where: { organizacao_id: org.id } });
      if (colaboradorLink && admin) {
        var pedidoExiste = await PedidoColaborador.findOne({ where: { organizacao_id: org.id } });
        if (!pedidoExiste) {
          await PedidoColaborador.bulkCreate([
            {
              organizacao_id: org.id,
              colaborador_id: colaboradorLink.id,
              tipo: "ferias",
              titulo: "Pedido de Ferias - Fim de Ano",
              descricao: "Solicito aprovacao para gozo de ferias anuais de 15 dias.",
              estado: "pendente",
              dados: { data_inicio: "2026-12-20", data_fim: "2027-01-04", dias: 15 },
            },
            {
              organizacao_id: org.id,
              colaborador_id: colaboradorLink.id,
              tipo: "adiantamento",
              titulo: "Adiantamento Salarial",
              descricao: "Solicito adiantamento de salario referente ao mes corrente.",
              estado: "pendente",
              dados: { valor: 50000, motivo: "Despesas medicas" },
            },
            {
              organizacao_id: org.id,
              colaborador_id: colaboradorLink.id,
              tipo: "justificacao",
              titulo: "Justificacao de Falta",
              descricao: "Justifico ausencia do dia 10/07/2026 por motivo de saude.",
              estado: "aprovado",
              responded_by: admin.id,
              responded_at: new Date(),
              comentario: "Aprovado. Apresentar atestado medico.",
              dados: { data_ausencia: "2026-07-10", motivo: "Consulta medica" },
            },
          ]);
          console.log(" Pedidos de exemplo criados!");
        }
      }
    } catch (e) {
      console.log(" Aviso: Nao foi possivel criar pedidos:", e.message);
    }
  } catch (e) {
    console.log(" Erro no seed:", e.message);
    console.log(e);
  }
};

module.exports = seed;
