// Seed LOCAL de dados de teste. Nunca apaga nada e pode correr quantas vezes quiser:
//   npm run seed:teste
//
// Regras aplicadas:
//   - numeracao de colaboradores e POR ORGANIZACAO (cada org comeca em COL-00001)
//   - cada colaborador tem id_biometrico proprio, contrato, presencas/faltas
//     e picagens biométricas ja processadas (sem precisar de arrancar a ponte)
//   - conta de administrador por organizacao + conta de suporte da plataforma

require("dotenv").config({ path: __dirname + "/../.env" });

var {
  sequelize,
  Organizacao,
  Perfil,
  Utilizador,
  Colaborador,
  Departamento,
  Seccao,
  Unidade,
  Contrato,
  RegistoPresenca,
  PicagemBiometrico,
  Feriado,
  Aviso,
} = require("../models");
var { proximoNumeroColaborador } = require("../helpers/numeroColaborador");

var SENHA_COLABORADOR = "colaborador123";
var SENHA_ADMIN_ORG = "Admin@2026";
var SENHA_SUPORTE = "Suporte@2026";

var ORGANIZACOES = [
  {
    nome: "CENFFOR",
    nome_curto: "CENFFOR",
    nif: null,
    email: "geral@cenffor.com",
    telefone: "+244 222 000 000",
    cidade: "Luanda",
    provincia: "Luanda",
    admin: {
      nome: "Gestor de RH (teste)",
      email: "rh@cenffor.com",
      username: "rh.teste",
      password: "Rh@2026",
    },
    departamentos: [
      { nome: "Tecnologia de Informação", codigo: "TESTE-DEP-TI", responsavel: "João Silva" },
      { nome: "Recursos Humanos", codigo: "TESTE-DEP-RH", responsavel: "Luísa Fernandes" },
      { nome: "Financeiro", codigo: "TESTE-DEP-FIN", responsavel: "Pedro Bunga" },
    ],
    seccoes: [
      { departamento: "TESTE-DEP-TI", nome: "Desenvolvimento", codigo: "TESTE-SEC-DEV", responsavel: "João Silva" },
      { departamento: "TESTE-DEP-RH", nome: "Pessoal", codigo: "TESTE-SEC-PESSOAL", responsavel: "Luísa Fernandes" },
    ],
    unidade: { nome: "Sede - Luanda", codigo: "TESTE-UNI-LUA", descricao: "Unidade de teste da CENFFOR", responsavel: "Gestor de RH (teste)" },
    colaboradores: [
      { nome: "João Silva", email: "joao.silva@cenffor.com", genero: "M", admissao: "2024-01-15", dept: "TESTE-DEP-TI", unidade: "Artes Gráficas", salario: 520000 },
      { nome: "Maria Nsimba", email: "maria.nsimba@cenffor.com", genero: "F", admissao: "2024-02-01", dept: "TESTE-DEP-RH", unidade: "Formação Profissional", salario: 610000, extra: ["Técnico de RH"] },
      { nome: "Pedro Bunga", email: "pedro.bunga@cenffor.com", genero: "M", admissao: "2024-03-11", dept: "TESTE-DEP-FIN", unidade: "Soluções Digitais", salario: 480000 },
      { nome: "Ana Costa", email: "ana.costa@cenffor.com", genero: "F", admissao: "2024-04-22", dept: "TESTE-DEP-TI", unidade: "Soluções Digitais", salario: 560000 },
      { nome: "Carlos Matos", email: "carlos.matos@cenffor.com", genero: "M", admissao: "2024-05-06", dept: "TESTE-DEP-FIN", unidade: "Artes Gráficas", salario: 450000 },
      { nome: "Luísa Fernandes", email: "luisa.fernandes@cenffor.com", genero: "F", admissao: "2024-06-17", dept: "TESTE-DEP-RH", unidade: "Formação Profissional", salario: 590000 },
      // Colaboradora sem faltas/atrasos recentes para validar a elegibilidade de crédito.
      { nome: "Helena Crédito", email: "helena.credito@cenffor.com", genero: "F", admissao: "2023-06-01", dept: "TESTE-DEP-FIN", unidade: "Soluções Digitais", salario: 700000, semFaltas: true },
      // Segunda colaboradora elegível, sem crédito aprovado, para novos testes.
      { nome: "Marina Crédito", email: "marina.credito@cenffor.com", genero: "F", admissao: "2023-06-01", dept: "TESTE-DEP-FIN", unidade: "Soluções Digitais", salario: 700000, semFaltas: true },
    ],
  },
  {
    nome: "TechAngola, Lda.",
    nome_curto: "TechAngola",
    nif: "500000001",
    email: "geral@techangola.ao",
    telefone: "+244 222 111 111",
    cidade: "Luanda",
    provincia: "Luanda",
    admin: {
      nome: "Administrador TechAngola",
      email: "admin@techangola.ao",
      username: "admin.techangola",
      password: SENHA_ADMIN_ORG,
    },
    departamentos: [
      { nome: "Tecnologia", codigo: "TA-DEP-TI", responsavel: "Miguel Ferreira" },
      { nome: "Operações", codigo: "TA-DEP-OPS", responsavel: "Sofia Mendes" },
    ],
    seccoes: [
      { departamento: "TA-DEP-TI", nome: "Desenvolvimento de Software", codigo: "TA-SEC-DEV", responsavel: "Miguel Ferreira" },
    ],
    unidade: { nome: "Sede - Luanda", codigo: "TA-UNI-LUA", descricao: "Unidade principal da TechAngola", responsavel: "Administrador TechAngola" },
    colaboradores: [
      { nome: "Miguel Ferreira", email: "miguel.ferreira@techangola.ao", genero: "M", admissao: "2025-01-10", dept: "TA-DEP-TI", unidade: "Soluções Digitais", salario: 700000 },
      { nome: "Sofia Mendes", email: "sofia.mendes@techangola.ao", genero: "F", admissao: "2025-02-03", dept: "TA-DEP-OPS", unidade: "Soluções Digitais", salario: 640000, extra: ["Técnico de RH"] },
      { nome: "Rui Kaputu", email: "rui.kaputu@techangola.ao", genero: "M", admissao: "2025-03-20", dept: "TA-DEP-TI", unidade: "Soluções Digitais", salario: 580000 },
    ],
  },
  {
    nome: "Instituto Horizonte",
    nome_curto: "Horizonte",
    nif: "500000002",
    email: "geral@horizonte.ao",
    telefone: "+244 222 222 222",
    cidade: "Huambo",
    provincia: "Huambo",
    admin: {
      nome: "Administrador Horizonte",
      email: "admin@horizonte.ao",
      username: "admin.horizonte",
      password: SENHA_ADMIN_ORG,
    },
    departamentos: [
      { nome: "Formação Profissional", codigo: "IH-DEP-FORM", responsavel: "Isabel dos Santos" },
      { nome: "Administração", codigo: "IH-DEP-ADM", responsavel: "Nelson Chimezie" },
    ],
    seccoes: [
      { departamento: "IH-DEP-FORM", nome: "Cursos Técnicos", codigo: "IH-SEC-CUR", responsavel: "Isabel dos Santos" },
    ],
    unidade: { nome: "Campus Huambo", codigo: "IH-UNI-HUA", descricao: "Unidade principal do Instituto Horizonte", responsavel: "Administrador Horizonte" },
    colaboradores: [
      { nome: "Isabel dos Santos", email: "isabel.santos@horizonte.ao", genero: "F", admissao: "2025-01-07", dept: "IH-DEP-FORM", unidade: "Formação Profissional", salario: 500000 },
      { nome: "Nelson Chimezie", email: "nelson.chimezie@horizonte.ao", genero: "M", admissao: "2025-04-14", dept: "IH-DEP-ADM", unidade: "Formação Profissional", salario: 470000 },
      { nome: "Teresa Gomes", email: "teresa.gomes@horizonte.ao", genero: "F", admissao: "2025-05-19", dept: "IH-DEP-FORM", unidade: "Formação Profissional", salario: 530000, extra: ["Técnico de RH"] },
    ],
  },
  {
    nome: "Comercial Futuro, Lda.",
    nome_curto: "Futuro",
    nif: "500000003",
    email: "geral@futuro.ao",
    telefone: "+244 222 333 333",
    cidade: "Benguela",
    provincia: "Benguela",
    admin: {
      nome: "Administrador Futuro",
      email: "admin@futuro.ao",
      username: "admin.futuro",
      password: SENHA_ADMIN_ORG,
    },
    departamentos: [
      { nome: "Comercial", codigo: "CF-DEP-COM", responsavel: "Bruno Lopes" },
      { nome: "Logística", codigo: "CF-DEP-LOG", responsavel: "Edna Paulo" },
    ],
    seccoes: [
      { departamento: "CF-DEP-COM", nome: "Vendas", codigo: "CF-SEC-VEN", responsavel: "Bruno Lopes" },
    ],
    unidade: { nome: "Loja Benguela", codigo: "CF-UNI-BEN", descricao: "Unidade principal da Comercial Futuro", responsavel: "Administrador Futuro" },
    colaboradores: [
      { nome: "Bruno Lopes", email: "bruno.lopes@futuro.ao", genero: "M", admissao: "2025-02-11", dept: "CF-DEP-COM", unidade: "Artes Gráficas", salario: 460000 },
      { nome: "Edna Paulo", email: "edna.paulo@futuro.ao", genero: "F", admissao: "2025-06-02", dept: "CF-DEP-LOG", unidade: "Artes Gráficas", salario: 440000 },
    ],
  },
];

var pad = function (n, tamanho) {
  return String(n).padStart(tamanho || 5, "0");
};

var prefixoOrg = function (nomeCurto) {
  return String(nomeCurto).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
};

var isoData = function (d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2);
};

var garantirPerfil = async function (nome, nivel) {
  var perfil = await Perfil.findOne({ where: { nome: nome } });
  if (!perfil) {
    perfil = await Perfil.create({
      nome: nome,
      nivel: nivel || 0,
      descricao: "Perfil criado pelo seed de teste",
      permissoes: {},
      activo: true,
    });
  }
  return perfil;
};

var garantirUtilizador = async function (dados) {
  var utilizador = await Utilizador.findOne({ where: { email: dados.email } });
  var criado = !utilizador;

  var valores = {
    nome_completo: dados.nome_completo,
    email: dados.email,
    username: dados.username,
    password: dados.password,
    telefone: dados.telefone || null,
    organizacao_id: dados.organizacao_id || null,
    super_admin: !!dados.super_admin,
    activo: true,
    bloqueado: false,
    tentativas_login: 0,
    must_change_password: false,
  };

  if (criado) {
    utilizador = await Utilizador.create(valores);
  } else {
    await utilizador.update(valores);
  }

  if (dados.perfil) {
    await utilizador.setPerfil(await garantirPerfil(dados.perfil.nome, dados.perfil.nivel));
  }
  if (dados.perfis_extra && dados.perfis_extra.length > 0) {
    var extra = [];
    for (var i = 0; i < dados.perfis_extra.length; i++) {
      extra.push(await garantirPerfil(dados.perfis_extra[i], 0));
    }
    await utilizador.setPerfis_extra(extra);
  }

  return { utilizador: utilizador, criado: criado };
};

var garantirDepartamento = async function (orgId, nome, codigo, responsavel) {
  var dept = await Departamento.findOne({ where: { codigo: codigo } });
  if (!dept) {
    dept = await Departamento.create({
      organizacao_id: orgId,
      nome: nome,
      codigo: codigo,
      tipo: "Departamento",
      responsavel_nome: responsavel || null,
      activo: true,
    });
  } else if (responsavel && dept.responsavel_nome !== responsavel) {
    await dept.update({ responsavel_nome: responsavel });
  }
  return dept;
};

var garantirSeccao = async function (orgId, deptId, nome, codigo, responsavel) {
  var seccao = await Seccao.findOne({ where: { codigo: codigo } });
  if (!seccao) {
    seccao = await Seccao.create({
      organizacao_id: orgId,
      departamento_id: deptId,
      nome: nome,
      tipo: "Secção",
      codigo: codigo,
      nivel: 1,
      responsavel_nome: responsavel || null,
      activo: true,
    });
  } else if (responsavel && seccao.responsavel_nome !== responsavel) {
    await seccao.update({ responsavel_nome: responsavel });
  }
  return seccao;
};

// Dias uteis recentes (ontem ate 15 dias utiles), sem feriados e sem fim de semana.
var diasUteisRecentes = async function (quantidade) {
  var feriados = await Feriado.findAll({ attributes: ["data"], raw: true });
  var feriadoSet = {};
  feriados.forEach(function (f) { feriadoSet[isoData(new Date(f.data))] = true; });

  var dias = [];
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  for (var volta = 1; dias.length < quantidade && volta < 60; volta++) {
    var candidato = new Date(hoje);
    candidato.setDate(hoje.getDate() - volta);
    var diaSemana = candidato.getDay();
    var texto = isoData(candidato);
    if (diaSemana === 0 || diaSemana === 6 || feriadoSet[texto]) continue;
    dias.push(texto);
  }
  return dias.reverse();
};

var garantirPresencasEBiometria = async function (colab, idBio, dias, opcoes) {
  var criadosPresenca = 0;
  var criadosPicagem = 0;
  var semFaltas = !!(opcoes && opcoes.semFaltas);

  for (var i = 0; i < dias.length; i++) {
    var data = dias[i];
    var padrao = (i + idBio.length) % 7;
    var estado = semFaltas ? "Presente" : (padrao === 3 ? "Ausente" : (padrao === 5 ? "Atrasado" : "Presente"));
    var entrada = estado === "Atrasado" ? "08:30" : "08:05";
    var saida = estado === "Atrasado" ? "16:30" : "16:00";
    var horas = estado === "Atrasado" ? 7.75 : 8.0;

    var [, criada] = await RegistoPresenca.findOrCreate({
      where: { colaborador_id: colab.id, data: data },
      defaults: {
        data: data,
        hora_entrada: estado === "Ausente" ? null : entrada,
        hora_saida: estado === "Ausente" ? null : saida,
        horas_trabalhadas: estado === "Ausente" ? null : horas,
        horas_extras: 0,
        estado: estado,
        metodo: "Biometrico",
        observacoes: estado === "Ausente"
          ? "Sem picagens registadas no biometro"
          : "Picagens sincronizadas pela ponte do biometro",
        justificado: false,
        processada: true,
        processada_mes: new Date(data + "T00:00:00").getMonth() + 1,
        processada_ano: new Date(data + "T00:00:00").getFullYear(),
      },
    });
    if (criada) criadosPresenca++;

    if (estado === "Ausente") continue;

    var momentos = [
      { hora: entrada, tipo: 0 },
      { hora: saida, tipo: 1 },
    ];
    for (var m = 0; m < momentos.length; m++) {
      var dataHora = new Date(data + "T" + momentos[m].hora + ":00");
      var cruda = JSON.stringify({
        id_biometrico: idBio,
        userId: idBio,
        recordTime: dataHora.toISOString(),
        tipo: momentos[m].tipo,
      }).slice(0, 490);
      var [, novaPicagem] = await PicagemBiometrico.findOrCreate({
        where: { id_biometrico: idBio, data_hora: dataHora },
        defaults: {
          colaborador_id: colab.id,
          tipo: momentos[m].tipo,
          raw: cruda,
          processada: true,
        },
      });
      if (novaPicagem) criadosPicagem++;
    }
  }

  return { presencas: criadosPresenca, picagens: criadosPicagem };
};

var main = async function () {
  try {
    await sequelize.authenticate();
    var dias = await diasUteisRecentes(15);
    var totais = { presencas: 0, picagens: 0, contratos: 0, comunicados: 0 };
    var resumo = [];

    for (var oi = 0; oi < ORGANIZACOES.length; oi++) {
      var cfg = ORGANIZACOES[oi];
      var prefixo = prefixoOrg(cfg.nome_curto);

      var org = await Organizacao.findOne({ where: { nome: cfg.nome } });
      if (!org) {
        org = await Organizacao.create({
          nome: cfg.nome,
          nome_curto: cfg.nome_curto,
          nif: cfg.nif,
          email: cfg.email,
          telefone: cfg.telefone,
          cidade: cfg.cidade,
          provincia: cfg.provincia,
          pais: "Angola",
          activo: true,
        });
      }

      var deptPorCodigo = {};
      for (var di = 0; di < cfg.departamentos.length; di++) {
        var d = cfg.departamentos[di];
        deptPorCodigo[d.codigo] = await garantirDepartamento(org.id, d.nome, d.codigo, d.responsavel);
      }
      for (var si = 0; si < cfg.seccoes.length; si++) {
        var s = cfg.seccoes[si];
        await garantirSeccao(org.id, deptPorCodigo[s.departamento].id, s.nome, s.codigo, s.responsavel);
      }
      if (cfg.unidade) {
        var unidade = await Unidade.findOne({ where: { codigo: cfg.unidade.codigo } });
        if (!unidade) {
          await Unidade.create({
            organizacao_id: org.id,
            nome: cfg.unidade.nome,
            codigo: cfg.unidade.codigo,
            descricao: cfg.unidade.descricao,
            responsavel_nome: cfg.unidade.responsavel || null,
            activo: true,
          });
        } else if (cfg.unidade.responsavel && unidade.responsavel_nome !== cfg.unidade.responsavel) {
          await unidade.update({ responsavel_nome: cfg.unidade.responsavel });
        }
      }

      var admin = await garantirUtilizador({
        nome_completo: cfg.admin.nome,
        email: cfg.admin.email,
        username: cfg.admin.username,
        password: cfg.admin.password,
        organizacao_id: org.id,
        perfil: { nome: "Administrador Geral", nivel: 4 },
      });

      // Sequencia DENTRO desta org (as outras orgs tem a sua propria).
      var usadosOrg = await Colaborador.findAll({
        where: { organizacao_id: org.id },
        attributes: ["numero_colaborador"],
        raw: true,
      });
      var seq = proximoNumeroColaborador(usadosOrg.map(function (linha) {
        return linha.numero_colaborador;
      }));
      var proximoNumero = function () {
        var actual = seq;
        seq = proximoNumeroColaborador([actual]);
        return actual;
      };

      var colabsPorEmail = {};
      for (var ci = 0; ci < cfg.colaboradores.length; ci++) {
        var item = cfg.colaboradores[ci];
        var colab = await Colaborador.findOne({ where: { email_institucional: item.email } });
        if (!colab) {
          colab = await Colaborador.create({
            organizacao_id: org.id,
            numero_colaborador: proximoNumero(),
            nome_completo: item.nome,
            nome_curto: item.nome.split(" ")[0],
            genero: item.genero,
            estado_civil: "Solteiro(a)",
            data_admissao: item.admissao,
            estado: "Activo",
            tipo_colaborador: "Interno",
            email_institucional: item.email,
            telefone: "+244 9" + String(20000000 + (oi * 100) + ci),
            departamento_id: deptPorCodigo[item.dept].id,
            unidade_negocio: item.unidade,
            rascunho: false,
          });
        } else {
          await colab.update({ organizacao_id: org.id, departamento_id: deptPorCodigo[item.dept].id });
        }
        colabsPorEmail[item.email] = { colab: colab, cfg: item };
      }

      // Renumeracao POR ORGANIZACAO em duas fases (evita colisao temporaria):
      // primeiro numeros temporarios, depois COL-00001... na ordem do seed.
      var todosDaOrg = await Colaborador.findAll({
        where: { organizacao_id: org.id },
        order: [["createdAt", "ASC"], ["id", "ASC"]],
      });
      var ordenados = [];
      cfg.colaboradores.forEach(function (item) {
        var encontrado = todosDaOrg.filter(function (c) { return c.email_institucional === item.email; })[0];
        if (encontrado) ordenados.push(encontrado);
      });
      todosDaOrg.forEach(function (c) {
        if (ordenados.indexOf(c) === -1) ordenados.push(c);
      });
      for (var ti = 0; ti < ordenados.length; ti++) {
        await ordenados[ti].update({ numero_colaborador: "TMP-" + pad(ti + 1) });
      }
      for (var fi = 0; fi < ordenados.length; fi++) {
        await ordenados[fi].update({ numero_colaborador: "COL-" + pad(fi + 1) });
      }

      var linhas = [];
      for (var li = 0; li < cfg.colaboradores.length; li++) {
        var info = colabsPorEmail[cfg.colaboradores[li].email];
        // Recarregar depois da renumeração para o output mostrar o COL-00001
        // de cada org, e não o numero antigo guardado na instância inicial.
        var colabFinal = await Colaborador.findByPk(info.colab.id);
        var idBio = prefixo + pad(li + 1, 3);
        await colabFinal.update({ id_biometrico: idBio });

        var conta = await garantirUtilizador({
          nome_completo: info.cfg.nome,
          email: info.cfg.email,
          username: info.cfg.email.split("@")[0],
          password: SENHA_COLABORADOR,
          telefone: "+244 9" + String(20000000 + (oi * 100) + li),
          organizacao_id: org.id,
          perfil: { nome: "Colaborador", nivel: 0 },
          perfis_extra: info.cfg.extra || [],
        });
        await sequelize.query(
          "UPDATE `colaboradores` SET `utilizador_id` = ? WHERE `id` = ?",
          { replacements: [conta.utilizador.id, colabFinal.id] }
        ).catch(function () { /* coluna opcional em bases antigas */ });

        var numeroContrato = "CTR-" + prefixo + "-" + pad(li + 1, 4);
        var contrato = await Contrato.findOrCreate({
          where: { numero: numeroContrato },
          defaults: {
            colaborador_id: colabFinal.id,
            numero: numeroContrato,
            tipo: "Indeterminado",
            data_inicio: info.cfg.admissao,
            data_assinatura: info.cfg.admissao,
            salario_base: info.cfg.salario,
            subsidio_alimentacao: 3000,
            moeda: "AOA",
            periodo_experimentacao: 90,
            funcao: deptPorCodigo[info.cfg.dept].nome,
            local_trabalho: cfg.cidade,
            horario_trabalho: "08:00 - 16:00",
            estado: "Activo",
            observacoes: "Contrato de teste gerado pelo seed",
          },
        });
        if (contrato[1]) totais.contratos++;

        var assiduidade = await garantirPresencasEBiometria(colabFinal, idBio, dias, { semFaltas: !!info.cfg.semFaltas });
        totais.presencas += assiduidade.presencas;
        totais.picagens += assiduidade.picagens;

        linhas.push("    " + info.cfg.nome + " <" + info.cfg.email + "> " +
          colabFinal.numero_colaborador + " | bio=" + idBio + " | " + numeroContrato +
          " | " + SENHA_COLABORADOR);
      }

      resumo.push({
        nome: cfg.nome,
        admin: cfg.admin.email + " / " + cfg.admin.password +
          " (" + (admin.criado ? "criada" : "actualizada") + ")",
        linhas: linhas,
      });
    }

    // 20 comunicados de teste para confirmar que o portal do colaborador
    // mostra apenas os 5 mais recentes (nao todos os registos da organizacao).
    var orgTeste = await Organizacao.findOne({ where: { nome: "CENFFOR" } });
    var adminTeste = await Utilizador.findOne({ where: { email: "rh@cenffor.com" } });
    if (orgTeste && adminTeste) {
      var tiposComunicado = ["Informativo", "Geral", "Evento", "Urgente"];
      for (var ci = 1; ci <= 20; ci++) {
        var tituloComunicado = "Comunicado de teste " + pad(ci, 2);
        var existenteComunicado = await Aviso.findOne({
          where: { organizacao_id: orgTeste.id, titulo: tituloComunicado },
        });
        if (!existenteComunicado) {
          await Aviso.create({
            organizacao_id: orgTeste.id,
            titulo: tituloComunicado,
            conteudo: "Comunicado de teste " + pad(ci, 2) +
              " criado para validar o limite de comunicados no portal do colaborador.",
            tipo: tiposComunicado[ci % tiposComunicado.length],
            visivel_para: "Todos",
            data_inicio: new Date(Date.now() - ci * 60 * 60 * 1000),
            publicado: true,
            criado_por: adminTeste.id,
          });
          totais.comunicados++;
        }
      }
    }

    var suporte = await garantirUtilizador({
      nome_completo: "Suporte da Plataforma",
      email: "suporte@sg-hr.ao",
      username: "suporte",
      password: SENHA_SUPORTE,
      super_admin: true,
    });

    console.log("");
    console.log("=== Dados de teste prontos ===");
    console.log("Numeracao: POR ORGANIZACAO (cada org começa em COL-00001)");
    resumo.forEach(function (r) {
      console.log("");
      console.log("Organizacao: " + r.nome);
      console.log("  Admin: " + r.admin);
      console.log("  Colaboradores: " + r.linhas.length);
      r.linhas.forEach(function (linha) { console.log(linha); });
    });
    console.log("");
    console.log("Contratos criados: " + totais.contratos);
    console.log("Presencas/faltas criadas: " + totais.presencas +
      " (metodo Biometrico, inclui absentismos)");
    console.log("Picagens biometricas criadas: " + totais.picagens +
      " (ja processadas - nao e preciso iniciar a ponte)");
    console.log("Comunicados de teste criados: " + totais.comunicados +
      " (portal mostra apenas os 5 mais recentes)");
    console.log("Suporte (plataforma): suporte@sg-hr.ao / " + SENHA_SUPORTE +
      "  (/plataforma/login) - " + (suporte.criado ? "criada" : "actualizada"));
    console.log("");
  } catch (e) {
    console.error("Erro no seed de teste:", e.stack || e.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

main();
