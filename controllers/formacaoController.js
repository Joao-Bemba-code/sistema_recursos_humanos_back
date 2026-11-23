var { Op } = require("sequelize");
var { sequelize } = require("../config");
var { CursoFormacao, InscricaoFormacao, Colaborador, Utilizador, Ficheiro } = require("../models");
var { ORG_INEXISTENTE, orgDaSessao, incluirColaboradorDaOrg, colaboradorNaOrg } = require("../helpers/organizacao");
var { temPermissao } = require("../protect/rbac");
var notificacaoController = require("./notificacaoController");
var {
  ESTADOS_INSCRICAO,
  ROTULOS_ESTADO_INSCRICAO,
  calcularProgresso,
  validarDadosCurso,
  validarDadosInscricao,
  calcularResultadoAvaliacao,
  aplicarRegrasConclusao,
  extensaoCertificadoValida,
  nomeCertificado,
} = require("../helpers/formacao");
var {
  guardarFicheiro,
  obterFicheiro,
  responderComFicheiro,
  apagarFicheiroDeUrl,
} = require("../helpers/ficheiros");

var ATRIBUTOS_CURSO = ["id", "nome", "descricao", "categoria", "tipo", "horas", "data_inicio", "data_fim", "vagas", "local", "nota_minima_aprovacao", "estado"];
var ATRIBUTOS_COLABORADOR = ["id", "nome_completo", "numero_colaborador", "utilizador_id"];
// Nota, resultado, data e observações da avaliação só podem ser escritos pelo
// endpoint /avaliacao. A criação/edição da inscrição trata apenas da inscrição
// em si e da conclusão/certificado.
var CAMPOS_INSCRICAO = [
  "estado", "horas_realizadas", "data_conclusao",
  "concluida_manualmente", "certificado", "data_certificado", "observacoes",
  "certificado_ficheiro_id",
];

var hoje = function () {
  return new Date().toISOString().substring(0, 10);
};

var LINK_FORMACOES = "/dashboard/minhas-formacoes";
var MODULO_FORMACAO = "formacao";

// Avisa o utilizador do colaborador sobre alterações nas suas formações.
// Segue o mesmo padrão de tarefas/pedidos: se não houver utilizador associado
// ou se a notificação falhar, a operação principal não é afectada.
var notificarColaboradorFormacao = async function (orgId, colaboradorId, titulo, mensagem, tipo) {
  if (!orgId || !colaboradorId) return;
  try {
    var colaborador = await Colaborador.findOne({
      where: { id: colaboradorId, organizacao_id: orgId },
      attributes: ["id", "utilizador_id", "email_institucional", "email_pessoal"],
    });
    if (!colaborador) return;

    var utilizadorId = colaborador.utilizador_id;
    if (!utilizadorId) {
      // Contas antigas podem não ter o utilizador_id preenchido no colaborador.
      var emails = [colaborador.email_institucional, colaborador.email_pessoal].filter(Boolean);
      if (!emails.length) return;
      var utilizador = await Utilizador.findOne({
        where: { organizacao_id: orgId, email: { [Op.in]: emails } },
        attributes: ["id"],
      });
      if (!utilizador) return;
      utilizadorId = utilizador.id;
    }

    await notificacaoController.create({
      organizacao_id: orgId,
      utilizador_id: utilizadorId,
      titulo: titulo,
      mensagem: mensagem,
      tipo: tipo || "info",
      link: LINK_FORMACOES,
      modulo: MODULO_FORMACAO,
    });
  } catch (e) {
    console.log("Aviso: notificação de formação não criada:", e.message);
  }
};

var nomeCursoDaInscricao = function (inscricao) {
  return inscricao && inscricao.curso && inscricao.curso.nome
    ? inscricao.curso.nome
    : "formação";
};

var incluirFicheiroCertificado = function () {
  return {
    model: Ficheiro,
    as: "ficheiro_certificado",
    attributes: ["id", "nome", "tipo", "tamanho", "url", "createdAt"],
    required: false,
  };
};

var incluirCursoDaOrg = function (orgId, obrigatorio) {
  return {
    model: CursoFormacao,
    as: "curso",
    attributes: ATRIBUTOS_CURSO,
    where: { organizacao_id: orgId || ORG_INEXISTENTE },
    required: obrigatorio !== false,
  };
};

var incluirColaborador = function (orgId) {
  return incluirColaboradorDaOrg(orgId, ATRIBUTOS_COLABORADOR);
};

// Devolve a inscrição já "hidratada" (curso, colaborador e certificado). Assim,
// quem acaba de criar uma inscrição vê imediatamente a população do curso e o
// estado do certificado, sem precisar de recarregar a página.
var carregarInscricao = async function (id, orgId, opcoes) {
  var cfg = opcoes || {};
  var include = [incluirCursoDaOrg(orgId, cfg.cursoObrigatorio !== false), incluirColaborador(orgId), incluirFicheiroCertificado()];
  var where = { id: id };
  if (cfg.colaborador_id) where.colaborador_id = cfg.colaborador_id;
  return InscricaoFormacao.findOne({ where: where, include: include });
};

var serializarInscricao = function (inscricao) {
  if (!inscricao) return null;
  var obj = typeof inscricao.toJSON === "function" ? inscricao.toJSON() : Object.assign({}, inscricao);
  var estimativa = calcularProgresso(obj, obj.curso, new Date());
  var ficheiro = obj.ficheiro_certificado;

  obj.progresso = estimativa.progresso;
  obj.em_atraso = estimativa.em_atraso;
  obj.concluida = estimativa.concluida;
  obj.rotulo_estado = ROTULOS_ESTADO_INSCRICAO[obj.estado] || obj.estado;
  obj.tem_certificado = !!(obj.certificado_ficheiro_id || ficheiro);
  obj.certificado_sem_ficheiro = !!obj.certificado && !obj.tem_certificado;
  obj.certificado_url = obj.tem_certificado ? "/api/formacao/inscricoes/" + obj.id + "/certificado" : null;
  obj.certificado_nome = ficheiro ? ficheiro.nome : null;
  // Dados da avaliação prontos para o painel do colaborador: o que foi
  // registado, quando recebeu e qual foi o resultado.
  obj.nota_minima_aprovacao = obj.curso && obj.curso.nota_minima_aprovacao != null
    ? Number(obj.curso.nota_minima_aprovacao) : 10;
  obj.avaliacao_registada = obj.nota_avaliacao != null || !!obj.data_avaliacao;
  obj.data_rececao = obj.data_certificado || obj.data_avaliacao ||
    (obj.avaliacao_registada ? obj.data_conclusao : null);
  // A conclusão e as horas são sempre apresentadas de acordo com o curso.
  var fimCurso = obj.curso && obj.curso.data_fim ? String(obj.curso.data_fim).substring(0, 10) : null;
  obj.data_conclusao_prevista = fimCurso;
  if (estimativa.concluida && fimCurso) obj.data_conclusao = fimCurso;
  if (obj.curso && obj.curso.horas != null) {
    obj.horas_realizadas = obj.curso.horas;
  }
  return obj;
};

var vagasOcupadasPorCurso = async function (cursoIds) {
  if (!cursoIds.length) return {};
  var linhas = await InscricaoFormacao.findAll({
    attributes: ["curso_id", [sequelize.fn("COUNT", sequelize.col("InscricaoFormacao.id")), "total"]],
    where: { curso_id: { [Op.in]: cursoIds }, estado: { [Op.in]: ["Inscrito", "Concluido"] } },
    group: ["curso_id"],
    raw: true,
  });
  var mapa = {};
  linhas.forEach(function (linha) { mapa[linha.curso_id] = Number(linha.total) || 0; });
  return mapa;
};

var anexarContagemVagas = function (cursos, ocupadas) {
  return cursos.map(function (curso) {
    var obj = typeof curso.toJSON === "function" ? curso.toJSON() : Object.assign({}, curso);
    obj.vagas_ocupadas = ocupadas[obj.id] || 0;
    obj.vagas_disponiveis = obj.vagas == null ? null : Math.max(0, Number(obj.vagas) - obj.vagas_ocupadas);
    return obj;
  });
};

var utilizadorPodeGerirFormacao = function (req) {
  return temPermissao(req.utilizador, "formacao", "read");
};

// ==================== CURSOS ====================

var listCursos = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var tipo = req.query.tipo;

    var where = { organizacao_id: orgDaSessao(req) || ORG_INEXISTENTE };
    if (search) {
      where[Op.or] = [
        { nome: { [Op.like]: "%" + search + "%" } },
        { descricao: { [Op.like]: "%" + search + "%" } },
        { categoria: { [Op.like]: "%" + search + "%" } },
        { local: { [Op.like]: "%" + search + "%" } },
      ];
    }
    if (estado) where.estado = estado;
    if (tipo) where.tipo = tipo;

    var { count, rows } = await CursoFormacao.findAndCountAll({
      where: where,
      order: [["data_inicio", "DESC"]],
      limit: limit,
      offset: offset,
    });

    var ocupadas = await vagasOcupadasPorCurso(rows.map(function (c) { return c.id; }));

    return res.status(200).json({
      dados: anexarContagemVagas(rows, ocupadas),
      paginacao: {
        total: count,
        pagina: page,
        limite: limit,
        total_paginas: Math.ceil(count / limit),
      },
    });
  } catch (e) {
    console.log("Erro ao listar cursos de formação:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var getCurso = async function (req, res) {
  try {
    var curso = await CursoFormacao.findOne({
      where: { id: req.params.id, organizacao_id: orgDaSessao(req) || ORG_INEXISTENTE },
    });

    if (!curso) {
      return res.status(404).json({ error: "Curso de formação não encontrado" });
    }

    // Inscrições apenas de colaboradores da organização da sessão, já com o
    // estado do certificado para a "população" do curso ficar visível de imediato.
    var inscricoes = await InscricaoFormacao.findAll({
      where: { curso_id: curso.id },
      include: [incluirColaborador(orgDaSessao(req)), incluirFicheiroCertificado()],
      order: [["data_inscricao", "DESC"]],
    });

    var dados = anexarContagemVagas([curso], await vagasOcupadasPorCurso([curso.id]))[0];
    dados.inscricoes = inscricoes.map(function (ins) {
      return serializarInscricao(Object.assign({}, ins.toJSON(), { curso: dados }));
    });

    return res.status(200).json({ dados: dados });
  } catch (e) {
    console.log("Erro ao obter curso de formação:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var createCurso = async function (req, res) {
  try {
    var erro = validarDadosCurso(req.body);
    if (erro) return res.status(400).json({ error: erro });

    if (!orgDaSessao(req)) {
      return res.status(403).json({ error: "Conta sem organização associada" });
    }

    // A organização vem sempre da sessão, nunca do corpo do pedido.
    var corpo = Object.assign({}, req.body, { organizacao_id: orgDaSessao(req) });
    var curso = await CursoFormacao.create(corpo);

    return res.status(201).json({
      mensagem: "Curso de formação criado com sucesso",
      dados: curso,
    });
  } catch (e) {
    console.log("Erro ao criar curso de formação:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var updateCurso = async function (req, res) {
  try {
    var curso = await CursoFormacao.findOne({
      where: { id: req.params.id, organizacao_id: orgDaSessao(req) || ORG_INEXISTENTE },
    });
    if (!curso) {
      return res.status(404).json({ error: "Curso de formação não encontrado" });
    }

    var camposProtegidos = ["id", "organizacao_id", "createdAt", "updatedAt"];
    var dadosActualizar = {};
    Object.keys(req.body).forEach(function (chave) {
      if (camposProtegidos.indexOf(chave) === -1) dadosActualizar[chave] = req.body[chave];
    });

    var erro = validarDadosCurso(Object.assign({}, curso.toJSON(), dadosActualizar));
    if (erro) return res.status(400).json({ error: erro });

    await curso.update(dadosActualizar);

    return res.status(200).json({
      mensagem: "Curso de formação atualizado com sucesso",
      dados: curso,
    });
  } catch (e) {
    console.log("Erro ao atualizar curso de formação:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var removeCurso = async function (req, res) {
  try {
    var curso = await CursoFormacao.findOne({
      where: { id: req.params.id, organizacao_id: orgDaSessao(req) || ORG_INEXISTENTE },
    });
    if (!curso) {
      return res.status(404).json({ error: "Curso de formação não encontrado" });
    }

    var temInscricoes = await InscricaoFormacao.count({ where: { curso_id: curso.id } });
    if (temInscricoes > 0) {
      return res.status(400).json({ error: "Não é possível eliminar um curso com inscrições associadas" });
    }

    await curso.destroy();
    return res.status(200).json({ mensagem: "Curso de formação eliminado com sucesso" });
  } catch (e) {
    console.log("Erro ao eliminar curso de formação:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== INSCRIÇÕES ====================

var listInscricoes = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var estado = req.query.estado;
    var curso_id = req.query.curso_id;
    var colaborador_id = req.query.colaborador_id;

    var where = {};
    if (estado) where.estado = estado;
    if (req.query.resultado) where.resultado = req.query.resultado;
    if (curso_id) where.curso_id = curso_id;
    if (colaborador_id) where.colaborador_id = colaborador_id;
    if (req.query.com_certificado === "1") where.certificado_ficheiro_id = { [Op.ne]: null };
    if (req.query.sem_certificado === "1") where.certificado_ficheiro_id = null;
    if (req.query.com_nota === "1") where.nota_avaliacao = { [Op.ne]: null };
    if (req.query.sem_nota === "1") where.nota_avaliacao = null;

    var cursoInclude = incluirCursoDaOrg(orgDaSessao(req), true);
    if (search) cursoInclude.where.nome = { [Op.like]: "%" + search + "%" };

    var { count, rows } = await InscricaoFormacao.findAndCountAll({
      where: where,
      include: [cursoInclude, incluirColaborador(orgDaSessao(req)), incluirFicheiroCertificado()],
      order: [["data_inscricao", "DESC"]],
      limit: limit,
      offset: offset,
    });

    return res.status(200).json({
      dados: rows.map(serializarInscricao),
      paginacao: {
        total: count,
        pagina: page,
        limite: limit,
        total_paginas: Math.ceil(count / limit),
      },
    });
  } catch (e) {
    console.log("Erro ao listar inscrições de formação:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Criação partilhada entre o painel administrativo e a auto-inscrição.
// Devolve { erro, status, inscricao } para o controlador decidir a resposta.
var criarInscricaoInterno = async function (orgId, cursoId, colaboradorId, dados) {
  if (!cursoId || !colaboradorId) {
    return { erro: "curso_id e colaborador_id são obrigatórios", status: 400 };
  }
  if (ESTADOS_INSCRICAO.indexOf((dados && dados.estado) || "Inscrito") === -1) {
    return { erro: "Estado de inscrição inválido", status: 400 };
  }

  var erroValidacao = validarDadosInscricao(dados);
  if (erroValidacao) return { erro: erroValidacao, status: 400 };

  var curso = await CursoFormacao.findOne({
    where: { id: cursoId, organizacao_id: orgId || ORG_INEXISTENTE },
  });
  if (!curso) return { erro: "Curso de formação não encontrado", status: 404 };
  if (curso.estado === "Cancelado") return { erro: "Este curso foi cancelado", status: 400 };

  var colaboradorValido = await colaboradorNaOrg(colaboradorId, orgId);
  if (!colaboradorValido) return { erro: "Colaborador não encontrado nesta organização", status: 404 };

  try {
    var inscricao = await sequelize.transaction(async function (transacao) {
      var inscricoesActivas = await InscricaoFormacao.count({
        where: { curso_id: cursoId, estado: { [Op.in]: ["Inscrito", "Concluido"] } },
        transaction: transacao,
      });
      if (curso.vagas && inscricoesActivas >= Number(curso.vagas)) {
        throw Object.assign(new Error("Curso sem vagas disponíveis"), { status: 400 });
      }

      var inscricaoExistente = await InscricaoFormacao.findOne({
        where: { curso_id: cursoId, colaborador_id: colaboradorId, estado: { [Op.in]: ["Inscrito", "Concluido"] } },
        transaction: transacao,
      });
      if (inscricaoExistente) {
        throw Object.assign(new Error("Colaborador já inscrito neste curso"), { status: 409 });
      }

      var corpo = {};
      CAMPOS_INSCRICAO.forEach(function (chave) {
        if (dados && dados[chave] !== undefined) corpo[chave] = dados[chave];
      });
      // Inputs de texto vazio vindos do formulário viram null.
      ["horas_realizadas", "data_conclusao", "data_certificado", "certificado_ficheiro_id"].forEach(function (chave) {
        if (corpo[chave] === "") corpo[chave] = null;
      });
      // Nota e resultado são atribuídos exclusivamente na avaliação (endpoint
      // próprio), nunca ao criar a inscrição.
      corpo.estado = corpo.estado || "Inscrito";
      aplicarRegrasConclusao(corpo, null, hoje(), curso);

      return InscricaoFormacao.create(
        Object.assign(corpo, { curso_id: cursoId, colaborador_id: colaboradorId }),
        { transaction: transacao }
      );
    });
    return { inscricao: inscricao };
  } catch (e) {
    if (e.status) return { erro: e.message, status: e.status };
    throw e;
  }
};

var createInscricao = async function (req, res) {
  try {
    var orgId = orgDaSessao(req);
    if (!orgId) return res.status(403).json({ error: "Conta sem organização associada" });

    var resultado = await criarInscricaoInterno(orgId, req.body.curso_id, req.body.colaborador_id, req.body);
    if (resultado.erro) {
      return res.status(resultado.status || 400).json({ error: resultado.erro });
    }

    var completa = await carregarInscricao(resultado.inscricao.id, orgId);
    await notificarColaboradorFormacao(
      orgId,
      resultado.inscricao.colaborador_id,
      "Nova Formação",
      "Foi-lhe atribuída a formação «" + nomeCursoDaInscricao(completa) + "». Consulte As Minhas Formações.",
      "info"
    );
    return res.status(201).json({
      mensagem: "Inscrição criada com sucesso",
      dados: serializarInscricao(completa),
    });
  } catch (e) {
    console.log("Erro ao criar inscrição:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var updateInscricao = async function (req, res) {
  try {
    var orgId = orgDaSessao(req) || ORG_INEXISTENTE;
    var inscricao = await carregarInscricao(req.params.id, orgId);
    if (!inscricao) return res.status(404).json({ error: "Inscrição não encontrada" });

    var dadosActualizar = {};
    CAMPOS_INSCRICAO.forEach(function (chave) {
      if (req.body[chave] !== undefined) dadosActualizar[chave] = req.body[chave];
    });

    // Campos numéricos/date vindos de <input> chegam como texto vazio.
    ["horas_realizadas", "data_conclusao", "data_certificado", "certificado_ficheiro_id"].forEach(function (chave) {
      if (dadosActualizar[chave] === "") dadosActualizar[chave] = null;
    });

    var erro = validarDadosInscricao(Object.assign({}, inscricao.toJSON(), dadosActualizar));
    if (erro) return res.status(400).json({ error: erro });

    if (dadosActualizar.certificado_ficheiro_id) {
      var ficheiro = await obterFicheiro(dadosActualizar.certificado_ficheiro_id, orgId);
      if (!ficheiro) return res.status(404).json({ error: "Ficheiro de certificado não encontrado nesta organização" });
    }

    // Mesmas regras da criação: conclusão manual e certificado coerentes.
    dadosActualizar = aplicarRegrasConclusao(dadosActualizar, inscricao.toJSON(), hoje(), inscricao.curso);

    var estadoAnterior = inscricao.estado;
    var ficheiroAnterior = inscricao.certificado_ficheiro_id;
    await inscricao.update(dadosActualizar);

    if (dadosActualizar.certificado_ficheiro_id && ficheiroAnterior && String(ficheiroAnterior) !== String(dadosActualizar.certificado_ficheiro_id)) {
      var antigo = await obterFicheiro(ficheiroAnterior, orgId);
      if (antigo) await apagarFicheiroDeUrl(antigo.url);
    }

    var actualizado = await carregarInscricao(inscricao.id, orgId);
    if (actualizado.estado !== estadoAnterior && ["Concluido", "Certificado"].indexOf(actualizado.estado) !== -1) {
      await notificarColaboradorFormacao(
        orgId,
        inscricao.colaborador_id,
        "Formação Concluída",
        "A formação «" + nomeCursoDaInscricao(actualizado) + "» foi marcada como concluída.",
        "success"
      );
    }
    return res.status(200).json({
      mensagem: "Inscrição atualizada com sucesso",
      dados: serializarInscricao(actualizado),
    });
  } catch (e) {
    console.log("Erro ao atualizar inscrição:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var removeInscricao = async function (req, res) {
  try {
    var orgId = orgDaSessao(req) || ORG_INEXISTENTE;
    var inscricao = await carregarInscricao(req.params.id, orgId);
    if (!inscricao) return res.status(404).json({ error: "Inscrição não encontrada" });

    if (inscricao.certificado_ficheiro_id) {
      var ficheiro = await obterFicheiro(inscricao.certificado_ficheiro_id, orgId);
      if (ficheiro) await apagarFicheiroDeUrl(ficheiro.url);
    }
    await inscricao.destroy();
    return res.status(200).json({ mensagem: "Inscrição eliminada com sucesso" });
  } catch (e) {
    console.log("Erro ao eliminar inscrição:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var anexarCertificado = async function (req, res) {
  try {
    var orgId = orgDaSessao(req) || ORG_INEXISTENTE;
    var inscricao = await carregarInscricao(req.params.id, orgId);
    if (!inscricao) return res.status(404).json({ error: "Inscrição não encontrada" });

    var ficheiroEnviado = req.files && (req.files.certificado || req.files.ficheiro);
    if (!ficheiroEnviado) return res.status(400).json({ error: "Selecione o ficheiro do certificado" });

    if (!extensaoCertificadoValida(ficheiroEnviado.name, ficheiroEnviado.mimetype)) {
      return res.status(400).json({ error: "Formato inválido. Use PDF, PNG ou JPG" });
    }

    var ficheiro = await guardarFicheiro({
      file: ficheiroEnviado,
      pasta: "certificados_formacao",
      nome: nomeCertificado(inscricao.curso, inscricao.colaborador, ficheiroEnviado.name),
      organizacao_id: orgDaSessao(req),
      carregado_por: req.utilizador && req.utilizador.id,
    });

    var anterior = inscricao.certificado_ficheiro_id;
    await inscricao.update({
      certificado_ficheiro_id: ficheiro.id,
      certificado: true,
      data_certificado: hoje(),
      estado: "Certificado",
      data_conclusao: inscricao.data_conclusao || hoje(),
    });

    if (anterior && String(anterior) !== String(ficheiro.id)) {
      var velho = await obterFicheiro(anterior, orgId);
      if (velho) await apagarFicheiroDeUrl(velho.url);
    }

    var actualizado = await carregarInscricao(inscricao.id, orgId);
    await notificarColaboradorFormacao(
      orgId,
      inscricao.colaborador_id,
      "Certificado Disponível",
      "Já pode descarregar o certificado da formação «" + nomeCursoDaInscricao(actualizado) + "».",
      "success"
    );
    return res.status(200).json({
      mensagem: "Certificado carregado com sucesso",
      dados: serializarInscricao(actualizado),
    });
  } catch (e) {
    var demasiadoGrande = /demasiado grande/i.test(e.message);
    console.log("Erro ao carregar certificado:", e.message);
    return res.status(demasiadoGrande ? 413 : 500).json({
      error: demasiadoGrande ? e.message : "Erro ao carregar certificado",
    });
  }
};

// Registo formal da avaliação: nota (0-20), resultado calculado pela minima do
// curso e, opcionalmente, o ficheiro do certificado/documento. Fica tudo visível
// no painel do colaborador (registado, quando recebeu e como foi avaliado).
var registarAvaliacao = async function (req, res) {
  try {
    var orgId = orgDaSessao(req) || ORG_INEXISTENTE;
    var inscricao = await carregarInscricao(req.params.id, orgId);
    if (!inscricao) return res.status(404).json({ error: "Inscrição não encontrada" });

    var nota = req.body && req.body.nota_avaliacao;
    if (nota === undefined || nota === null || nota === "") {
      return res.status(400).json({ error: "Introduza a nota de avaliação (0-20)" });
    }
    var erroNota = validarDadosInscricao({ nota_avaliacao: nota });
    if (erroNota) return res.status(400).json({ error: erroNota });

    var minima = inscricao.curso && inscricao.curso.nota_minima_aprovacao != null
      ? Number(inscricao.curso.nota_minima_aprovacao) : 10;
    var resultado = calcularResultadoAvaliacao(nota, minima);

    var ficheiroEnviado = req.files && (req.files.certificado || req.files.ficheiro);
    if (ficheiroEnviado && !extensaoCertificadoValida(ficheiroEnviado.name, ficheiroEnviado.mimetype)) {
      return res.status(400).json({ error: "Formato inválido. Use PDF, PNG ou JPG" });
    }

    // O anexo nao pode impedir o registo da avaliacao: se o servico de
    // ficheiros falhar, a nota e o resultado sao guardados na mesma e o
    // documento pode ser anexado depois na aba «Avaliacoes».
    var ficheiro = null;
    var erroDocumento = null;
    if (ficheiroEnviado) {
      try {
        ficheiro = await guardarFicheiro({
          file: ficheiroEnviado,
          pasta: "certificados_formacao",
          nome: nomeCertificado(inscricao.curso, inscricao.colaborador, ficheiroEnviado.name),
          organizacao_id: orgDaSessao(req),
          carregado_por: req.utilizador && req.utilizador.id,
        });
      } catch (eUpload) {
        console.log(" Erro ao anexar documento da avaliacao:", eUpload.message);
        erroDocumento = /timeout/i.test(String(eUpload.message || ""))
          ? "O documento nao foi anexado porque o servico de ficheiros demorou a responder. Tente novamente na aba «Avaliacoes»."
          : "O documento nao foi anexado: " + eUpload.message;
      }
    }

    var anterior = inscricao.certificado_ficheiro_id;
    var temFicheiro = !!(ficheiro || anterior);
    var dados = {
      nota_avaliacao: nota,
      resultado: resultado,
      data_avaliacao: hoje(),
      avaliado_por: req.utilizador && req.utilizador.id,
      concluida_manualmente: true,
      data_conclusao: inscricao.data_conclusao ||
        (inscricao.curso && inscricao.curso.data_fim ? String(inscricao.curso.data_fim).substring(0, 10) : null) ||
        hoje(),
      estado: temFicheiro ? "Certificado" : "Concluido",
    };
    if (req.body.avaliacao_observacoes !== undefined) {
      dados.avaliacao_observacoes = req.body.avaliacao_observacoes;
    }
    if (inscricao.horas_realizadas == null && inscricao.curso && inscricao.curso.horas != null) {
      dados.horas_realizadas = inscricao.curso.horas;
    }
    if (ficheiro) {
      dados.certificado_ficheiro_id = ficheiro.id;
      dados.certificado = true;
      dados.data_certificado = hoje();
    }

    await inscricao.update(dados);

    if (ficheiro && anterior && String(anterior) !== String(ficheiro.id)) {
      var velho = await obterFicheiro(anterior, orgId);
      if (velho) await apagarFicheiroDeUrl(velho.url);
    }

    var actualizado = await carregarInscricao(inscricao.id, orgId);
    await notificarColaboradorFormacao(
      orgId,
      inscricao.colaborador_id,
      resultado === "Aprovado" ? "Formação Concluída" : "Resultado da Formação",
      "A sua formação «" + nomeCursoDaInscricao(actualizado) + "» foi avaliada: " + resultado +
        (nota != null && nota !== "" ? " (" + nota + " / 20)." : "."),
      resultado === "Aprovado" ? "success" : "error"
    );
    var mensagem = "Avaliação registada com sucesso: " + resultado;
    if (erroDocumento) mensagem += " · " + erroDocumento;
    return res.status(200).json({
      mensagem: mensagem,
      documento_erro: erroDocumento,
      dados: serializarInscricao(actualizado),
    });
  } catch (e) {
    var demasiadoGrande = /demasiado grande/i.test(e.message);
    console.log("Erro ao registar avaliação:", e.message);
    return res.status(demasiadoGrande ? 413 : 500).json({
      error: demasiadoGrande ? e.message : "Erro ao registar a avaliação",
    });
  }
};

var descarregarCertificado = async function (req, res) {
  try {
    var orgId = orgDaSessao(req) || ORG_INEXISTENTE;
    var inscricao = await carregarInscricao(req.params.id, orgId);
    if (!inscricao) return res.status(404).json({ error: "Inscrição não encontrada" });

    var dono = !!(inscricao.colaborador && req.utilizador &&
      inscricao.colaborador.utilizador_id && String(inscricao.colaborador.utilizador_id) === String(req.utilizador.id));
    if (!dono && !utilizadorPodeGerirFormacao(req)) {
      return res.status(403).json({ error: "Sem permissão para descarregar este certificado" });
    }
    if (!inscricao.certificado_ficheiro_id) {
      return res.status(404).json({ error: "Ainda não existe certificado carregado para esta formação" });
    }

    var ficheiro = await obterFicheiro(inscricao.certificado_ficheiro_id, orgId);
    if (!ficheiro) return res.status(404).json({ error: "Ficheiro do certificado indisponível" });

    var nome = nomeCertificado(inscricao.curso, inscricao.colaborador, ficheiro.nome);
    var enviado = await responderComFicheiro(res, ficheiro.url, nome);
    if (!enviado) return res.status(404).json({ error: "Conteúdo do certificado indisponível" });
  } catch (e) {
    console.log("Erro ao descarregar certificado:", e.message);
    return res.status(500).json({ error: "Erro ao descarregar certificado" });
  }
};

var removerCertificado = async function (req, res) {
  try {
    var orgId = orgDaSessao(req) || ORG_INEXISTENTE;
    var inscricao = await carregarInscricao(req.params.id, orgId);
    if (!inscricao) return res.status(404).json({ error: "Inscrição não encontrada" });
    if (!inscricao.certificado_ficheiro_id) {
      return res.status(404).json({ error: "Esta inscrição ainda não tem certificado carregado" });
    }

    var ficheiro = await obterFicheiro(inscricao.certificado_ficheiro_id, orgId);
    await inscricao.update({
      certificado_ficheiro_id: null,
      certificado: false,
      data_certificado: null,
    });
    if (ficheiro) await apagarFicheiroDeUrl(ficheiro.url);

    var actualizado = await carregarInscricao(inscricao.id, orgId);
    return res.status(200).json({
      mensagem: "Certificado removido com sucesso",
      dados: serializarInscricao(actualizado),
    });
  } catch (e) {
    console.log("Erro ao remover certificado:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// ==================== PAINEL DO COLABORADOR ====================

var colaboradorAlvo = async function (req) {
  var orgId = orgDaSessao(req) || ORG_INEXISTENTE;
  var pedidoId = req.query.colaborador_id || (req.body && req.body.colaborador_id);

  if (pedidoId) {
    if (!utilizadorPodeGerirFormacao(req)) return null;
    return Colaborador.findOne({ where: { id: pedidoId, organizacao_id: orgId }, attributes: ATRIBUTOS_COLABORADOR });
  }
  var utilizador = req.utilizador || {};
  var encontrado = await Colaborador.findOne({
    where: { utilizador_id: utilizador.id, organizacao_id: orgId },
    attributes: ATRIBUTOS_COLABORADOR,
  });
  if (encontrado || !utilizador.email) return encontrado;
  // Contas antigas podem nao ter o utilizador_id preenchido no colaborador.
  // Nesse caso, a ligacao e feita pelo email dentro da mesma organizacao.
  return Colaborador.findOne({
    where: {
      organizacao_id: orgId,
      [Op.or]: [
        { email_pessoal: utilizador.email },
        { email_institucional: utilizador.email },
      ],
    },
    attributes: ATRIBUTOS_COLABORADOR,
  });
};

var listMinhasFormacoes = async function (req, res) {
  try {
    var orgId = orgDaSessao(req) || ORG_INEXISTENTE;
    var colaborador = await colaboradorAlvo(req);
    if (!colaborador) {
      return res.status(404).json({ error: "Não existe um colaborador associado a esta conta" });
    }

    var inscricoes = await InscricaoFormacao.findAll({
      where: { colaborador_id: colaborador.id },
      include: [incluirCursoDaOrg(orgId, true), incluirFicheiroCertificado()],
      order: [["data_inscricao", "DESC"]],
    });

    var inscritasIds = inscricoes.map(function (i) { return i.curso_id; });
    var whereDisponiveis = {
      organizacao_id: orgId || ORG_INEXISTENTE,
      estado: { [Op.in]: ["Planeado", "Em_curso"] },
    };
    if (inscritasIds.length) whereDisponiveis.id = { [Op.notIn]: inscritasIds };

    var disponiveis = await CursoFormacao.findAll({
      where: whereDisponiveis,
      order: [["data_inicio", "ASC"]],
      limit: 50,
    });
    var ocupadas = await vagasOcupadasPorCurso(disponiveis.map(function (c) { return c.id; }));

    var dados = inscricoes.map(serializarInscricao);
    return res.status(200).json({
      dados: {
        colaborador: colaborador,
        inscricoes: dados,
        disponiveis: anexarContagemVagas(disponiveis, ocupadas),
        resumo: {
          total: dados.length,
          concluidas: dados.filter(function (i) { return i.concluida; }).length,
          com_certificado: dados.filter(function (i) { return i.tem_certificado; }).length,
          avaliacoes: dados.filter(function (i) { return i.avaliacao_registada; }).length,
          em_atraso: dados.filter(function (i) { return i.em_atraso; }).length,
        },
      },
    });
  } catch (e) {
    console.log("Erro ao listar formações do colaborador:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var inscreverMe = async function (req, res) {
  try {
    var orgId = orgDaSessao(req);
    if (!orgId) return res.status(403).json({ error: "Conta sem organização associada" });

    var colaborador = await colaboradorAlvo(req);
    if (!colaborador) return res.status(404).json({ error: "Não existe um colaborador associado a esta conta" });

    var resultado = await criarInscricaoInterno(orgId, req.body.curso_id, colaborador.id, { estado: "Inscrito" });
    if (resultado.erro) return res.status(resultado.status || 400).json({ error: resultado.erro });

    var completa = await carregarInscricao(resultado.inscricao.id, orgId);
    return res.status(201).json({
      mensagem: "Inscrição efetuada com sucesso",
      dados: serializarInscricao(completa),
    });
  } catch (e) {
    console.log("Erro ao inscrever colaborador:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = {
  listCursos, getCurso, createCurso, updateCurso, removeCurso,
  listInscricoes, createInscricao, updateInscricao, removeInscricao,
  anexarCertificado, descarregarCertificado, removerCertificado, registarAvaliacao,
  listMinhasFormacoes, inscreverMe,
};
