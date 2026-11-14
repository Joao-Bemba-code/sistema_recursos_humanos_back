var { Op } = require("sequelize");
var { Aviso, ComunicacaoAnexo, Utilizador, Colaborador, Departamento, Cargo, Unidade, Seccao, UnidadeSeccao } = require("../models");
var { perfisUtilizador, fundirPermissoes } = require("../protect/rbac");

// Limites dos anexos (guardados na BD em base64): ate 8 ficheiros, cada um
// ate ~10MB depois de codificado em base64.
var MAX_ANEXOS = 8;
var MAX_ANEXO_B64 = 14 * 1024 * 1024;

var isGestor = function (req) {
  if (!req.utilizador) return false;
  var perfis = perfisUtilizador(req.utilizador);
  var fundido = fundirPermissoes(perfis);
  if (fundido.nivel >= 4) return true;
  // Matriz de permissoes: quem pode criar/actualizar comunicados e gestor
  if (fundido.permissoes.comunicados &&
    (fundido.permissoes.comunicados.indexOf("create") !== -1 ||
     fundido.permissoes.comunicados.indexOf("update") !== -1)) {
    return true;
  }
  var rolesPermitidas = ["Administrador Geral", "Director Geral", "Director de Recursos Humanos", "Técnico de RH"];
  return perfis.some(function (p) {
    return p && rolesPermitidas.indexOf(p.nome) !== -1;
  });
};

var incluirAnexos = [
  { model: Utilizador, as: "criador", attributes: ["id", "nome_completo", "email"] },
  { model: Departamento, as: "departamento", attributes: ["id", "nome"] },
  { model: Cargo, as: "cargo", attributes: ["id", "nome"] },
  { model: Colaborador, as: "colaborador_destino", attributes: ["id", "nome_completo", "nome_curto"] },
  { model: Unidade, as: "unidade", attributes: ["id", "nome"], required: false },
  { model: ComunicacaoAnexo, as: "anexos", attributes: ["id", "nome", "tipo", "tamanho", "createdAt"] },
];

// Limpa os campos de destinatario conforme o visivel_para escolhido, para
// nunca ficarem alvos pendurados de uma opcao anterior.
var limparDestinatarios = function (dados, visivelPara) {
  if (visivelPara !== "Departamento") dados.departamento_id = null;
  if (visivelPara !== "Cargo") dados.cargo_id = null;
  if (visivelPara !== "Perfil") dados.colaborador_id = null;
  if (visivelPara !== "Unidade") dados.unidade_id = null;
  return dados;
};

// Valida que a opcao escolhida tem o alvo preenchido.
var validarDestino = function (visivelPara, dados) {
  if (visivelPara === "Departamento" && !dados.departamento_id) {
    return "Indique o departamento de destino";
  }
  if (visivelPara === "Cargo" && !dados.cargo_id) {
    return "Indique o cargo de destino";
  }
  if (visivelPara === "Perfil" && !dados.colaborador_id) {
    return "Indique o colaborador de destino";
  }
  if (visivelPara === "Unidade" && !dados.unidade_id) {
    return "Indique a unidade de destino";
  }
  return null;
};

// Normaliza "dados" (pode vir como data URI "data:...;base64,XXXX" ou base64 puro)
var extrairBase64 = function (dados) {
  if (typeof dados !== "string") return "";
  var pos = dados.indexOf("base64,");
  if (pos !== -1) {
    return dados.slice(pos + "base64,".length);
  }
  return dados;
};

var criarAnexos = async function (comunicadoId, anexos) {
  if (!Array.isArray(anexos) || anexos.length === 0) return 0;
  var criados = 0;
  for (var i = 0; i < anexos.length && i < MAX_ANEXOS; i++) {
    var a = anexos[i];
    if (!a || !a.nome || !a.dados) continue;
    var b64 = extrairBase64(a.dados);
    if (!b64 || b64.length > MAX_ANEXO_B64) continue;
    await ComunicacaoAnexo.create({
      comunicado_id: comunicadoId,
      nome: String(a.nome).slice(0, 255),
      tipo: a.tipo ? String(a.tipo).slice(0, 150) : null,
      tamanho: a.tamanho ? parseInt(a.tamanho, 10) : null,
      dados: b64,
    });
    criados++;
  }
  return criados;
};

// Opcoes de destinatarios para o formulario de comunicados: colaboradores
// activos (com cargo e departamento), cargos (com os departamentos onde ha
// colaboradores com esse cargo) e departamentos da organizacao.
var destinatarios = async function (req, res) {
  try {
    var orgId = req.utilizador.organizacao_id;

    var colaboradores = await Colaborador.findAll({
      where: { organizacao_id: orgId, estado: "Activo" },
      attributes: ["id", "nome_completo", "nome_curto", "cargo_id", "departamento_id", "unidade_id"],
      include: [
        { model: Cargo, as: "cargo", attributes: ["id", "nome"] },
        { model: Departamento, as: "departamento", attributes: ["id", "nome"] },
        { model: Unidade, as: "unidade", attributes: ["id", "nome"], required: false },
      ],
      order: [["nome_completo", "ASC"]],
    });

    var cargos = await Cargo.findAll({
      attributes: ["id", "nome"],
      where: { activo: true },
      order: [["nome", "ASC"]],
    });

    // Departamentos onde ha colaboradores com cada cargo (para mostrar ao lado
    // do nome do cargo: "Cargo — Departamento").
    var deptsPorCargo = {};
    colaboradores.forEach(function (c) {
      if (!c.cargo_id || !c.departamento_id) return;
      if (!deptsPorCargo[c.cargo_id]) deptsPorCargo[c.cargo_id] = {};
      if (c.departamento) deptsPorCargo[c.cargo_id][c.departamento_id] = c.departamento.nome;
    });

    var departamentos = await Departamento.findAll({
      where: { organizacao_id: orgId },
      attributes: ["id", "nome"],
      order: [["nome", "ASC"]],
    });

    var unidades = await Unidade.findAll({
      where: { organizacao_id: orgId },
      attributes: ["id", "nome", "codigo"],
      include: [{
        model: Seccao,
        as: "seccoes",
        attributes: ["id", "nome", "departamento_id"],
        through: { attributes: [] },
        include: [{ model: Departamento, as: "departamento", attributes: ["id", "nome"] }],
      }],
      order: [["nome", "ASC"]],
    });

    return res.status(200).json({
      colaboradores: colaboradores.map(function (c) {
        return {
          id: c.id,
          nome: c.nome_completo || c.nome_curto || "",
          cargo: c.cargo ? c.cargo.nome : "",
          departamento: c.departamento ? c.departamento.nome : "",
          unidade: c.unidade ? c.unidade.nome : "",
          unidade_id: c.unidade_id || null,
        };
      }),
      cargos: cargos.map(function (cg) {
        var nomes = [];
        if (deptsPorCargo[cg.id]) {
          Object.keys(deptsPorCargo[cg.id]).forEach(function (k) {
            if (deptsPorCargo[cg.id][k]) nomes.push(deptsPorCargo[cg.id][k]);
          });
        }
        return { id: cg.id, nome: cg.nome, departamentos: nomes };
      }),
      departamentos: departamentos,
      unidades: unidades,
    });
  } catch (e) {
    console.log("Erro ao listar destinatarios:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var list = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 15;
    var offset = (page - 1) * limit;
    var search = req.query.search || "";
    var tipo = req.query.tipo;
    var publicado = req.query.publicado;
    var gestor = isGestor(req);

    var where = {
      organizacao_id: req.utilizador.organizacao_id,
    };

    if (!gestor) {
      where.publicado = true;
      where[Op.and] = where[Op.and] || [];

      // Janela de validade (sem data de fim = sempre visivel)
      var dataActual = new Date();
      where[Op.and].push({
        [Op.or]: [
          { data_fim: null },
          { data_fim: { [Op.gte]: dataActual } },
        ],
      });

      // Visibilidade: so aparecem os comunicados "Todos" e os destinados ao
      // departamento/cargo/perfil do colaborador que esta a ver. Comunicados
      // antigos com destino escolhido mas sem alvo definido ficam visiveis
      // para todos (nunca desaparecem).
      var meuColab = await Colaborador.findOne({
        where: { utilizador_id: req.utilizador.id, organizacao_id: req.utilizador.organizacao_id },
      });
      var alternativas = [
        { visivel_para: "Todos" },
        { visivel_para: { [Op.in]: ["Departamento", "Cargo", "Perfil", "Unidade"] }, departamento_id: null, cargo_id: null, colaborador_id: null, unidade_id: null },
      ];
      if (meuColab) {
        if (meuColab.departamento_id) {
          alternativas.push({ visivel_para: "Departamento", departamento_id: meuColab.departamento_id });
        }
        if (meuColab.cargo_id) {
          alternativas.push({ visivel_para: "Cargo", cargo_id: meuColab.cargo_id });
        }
        if (meuColab.unidade_id) {
          alternativas.push({ visivel_para: "Unidade", unidade_id: meuColab.unidade_id });
        }
        alternativas.push({ visivel_para: "Perfil", colaborador_id: meuColab.id });
      }
      where[Op.and].push({ [Op.or]: alternativas });
    } else {
      if (publicado !== undefined) {
        where.publicado = publicado === "true" || publicado === "1";
      }
    }

    if (search) {
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({
        [Op.or]: [
          { titulo: { [Op.like]: "%" + search + "%" } },
          { conteudo: { [Op.like]: "%" + search + "%" } },
        ],
      });
    }

    if (tipo) {
      where.tipo = tipo;
    }

    // Filtro por unidade (gestores): ver comunicados dirigidos a uma unidade.
    if (gestor && req.query.unidade_id) {
      where.unidade_id = req.query.unidade_id;
    }

    // Filtro por departamento (gestores): comunicados dirigidos ao departamento
    // ou a unidades que pertencem a sectores desse departamento.
    if (gestor && req.query.departamento_id) {
      var deptId = req.query.departamento_id;
      var seccoesDept = await Seccao.findAll({
        where: { organizacao_id: req.utilizador.organizacao_id, departamento_id: deptId },
        attributes: ["id"],
      });
      var idsSeccaoDept = seccoesDept.map(function (s) { return s.id; });
      var idsUnidadeDept = [];
      if (idsSeccaoDept.length > 0) {
        var ligacoesDept = await UnidadeSeccao.findAll({
          where: { seccao_id: { [Op.in]: idsSeccaoDept } },
          attributes: ["unidade_id"],
        });
        ligacoesDept.forEach(function (l) {
          if (l.unidade_id && idsUnidadeDept.indexOf(l.unidade_id) === -1) idsUnidadeDept.push(l.unidade_id);
        });
      }
      var alvosDept = [{ departamento_id: deptId }];
      if (idsUnidadeDept.length > 0) alvosDept.push({ unidade_id: { [Op.in]: idsUnidadeDept } });
      where[Op.and] = where[Op.and] || [];
      where[Op.and].push({ [Op.or]: alvosDept });
    }

    var { count, rows } = await Aviso.findAndCountAll({
      where: where,
      include: incluirAnexos,
      order: [["createdAt", "DESC"]],
      limit: limit,
      offset: offset,
      distinct: true,
    });

    return res.status(200).json({
      dados: rows,
      paginacao: {
        total: count,
        pagina: page,
        limite: limit,
        total_paginas: Math.ceil(count / limit),
      },
    });
  } catch (e) {
    console.log("Erro ao listar comunicados:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var get = async function (req, res) {
  try {
    var aviso = await Aviso.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
      include: incluirAnexos,
    });

    if (!aviso) {
      return res.status(404).json({ error: "Comunicado nao encontrado" });
    }

    if (!aviso.publicado && !isGestor(req)) {
      return res.status(403).json({ error: "Comunicado nao disponivel" });
    }

    return res.status(200).json({ dados: aviso });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var create = async function (req, res) {
  try {
    var dados = req.body;

    if (!dados.titulo) {
      return res.status(400).json({ error: "titulo e obrigatorio" });
    }
    if (!dados.conteudo) {
      return res.status(400).json({ error: "conteudo e obrigatorio" });
    }

    var anexos = dados.anexos;
    var payload = {};
    Object.keys(dados).forEach(function (k) {
      if (k !== "anexos") payload[k] = dados[k];
    });

    payload = limparDestinatarios(payload, payload.visivel_para || "Todos");
    var erroDestino = validarDestino(payload.visivel_para || "Todos", payload);
    if (erroDestino) {
      return res.status(400).json({ error: erroDestino });
    }

    payload.organizacao_id = req.utilizador.organizacao_id;
    payload.criado_por = req.utilizador.id;

    var aviso = await Aviso.create(payload);

    var criados = await criarAnexos(aviso.id, anexos);

    var resultado = await Aviso.findByPk(aviso.id, { include: incluirAnexos });

    return res.status(201).json({
      mensagem: criados > 0 ? "Comunicado criado com sucesso (" + criados + " anexo(s))" : "Comunicado criado com sucesso",
      dados: resultado,
    });
  } catch (e) {
    console.log("Erro ao criar comunicado:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var update = async function (req, res) {
  try {
    var aviso = await Aviso.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
    });

    if (!aviso) {
      return res.status(404).json({ error: "Comunicado nao encontrado" });
    }

    var camposProtegidos = ["id", "organizacao_id", "criado_por", "createdAt", "updatedAt", "anexos", "anexos_remover"];
    var dadosActualizar = {};

    var keys = Object.keys(req.body);
    for (var i = 0; i < keys.length; i++) {
      if (camposProtegidos.indexOf(keys[i]) === -1) {
        dadosActualizar[keys[i]] = req.body[keys[i]];
      }
    }

    // Limpa/valida os destinatarios conforme a opcao final (a nova ou a que
    // ja estava no registo).
    var visivelFinal = dadosActualizar.visivel_para || aviso.visivel_para || "Todos";
    dadosActualizar = limparDestinatarios(dadosActualizar, visivelFinal);
    var erroDestino = validarDestino(visivelFinal, Object.assign(
      { departamento_id: aviso.departamento_id, cargo_id: aviso.cargo_id, colaborador_id: aviso.colaborador_id, unidade_id: aviso.unidade_id },
      dadosActualizar
    ));
    if (erroDestino) {
      return res.status(400).json({ error: erroDestino });
    }

    await aviso.update(dadosActualizar);

    // Remover anexos pedidos
    var remover = req.body.anexos_remover;
    if (Array.isArray(remover) && remover.length > 0) {
      await ComunicacaoAnexo.destroy({
        where: { comunicado_id: aviso.id, id: { [Op.in]: remover } },
      });
    }

    // Adicionar novos anexos
    await criarAnexos(aviso.id, req.body.anexos);

    var resultado = await Aviso.findByPk(aviso.id, { include: incluirAnexos });

    return res.status(200).json({
      mensagem: "Comunicado actualizado com sucesso",
      dados: resultado,
    });
  } catch (e) {
    console.log("Erro ao actualizar comunicado:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var remove = async function (req, res) {
  try {
    var aviso = await Aviso.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
    });

    if (!aviso) {
      return res.status(404).json({ error: "Comunicado nao encontrado" });
    }

    await ComunicacaoAnexo.destroy({ where: { comunicado_id: aviso.id } });
    await aviso.destroy();

    return res.status(200).json({ mensagem: "Comunicado eliminado com sucesso" });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var togglePublicado = async function (req, res) {
  try {
    var aviso = await Aviso.findOne({
      where: {
        id: req.params.id,
        organizacao_id: req.utilizador.organizacao_id,
      },
    });

    if (!aviso) {
      return res.status(404).json({ error: "Comunicado nao encontrado" });
    }

    await aviso.update({ publicado: !aviso.publicado });

    return res.status(200).json({
      mensagem: aviso.publicado ? "Comunicado publicado" : "Comunicado despublicado",
      dados: aviso,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Download de anexo: visivel para QUALQUER utilizador autenticado da
// organizacao (desde que o comunicado esteja publicado ou o utilizador seja
// gestor). O ficheiro vem da BD, nao do disco.
var downloadAnexo = async function (req, res) {
  try {
    var anexo = await ComunicacaoAnexo.findOne({
      where: { id: req.params.anexoId, comunicado_id: req.params.id },
      include: [
        { model: Aviso, as: "comunicado", attributes: ["id", "organizacao_id", "publicado", "titulo"] },
      ],
    });

    if (!anexo || !anexo.comunicado) {
      return res.status(404).json({ error: "Anexo nao encontrado" });
    }

    if (anexo.comunicado.organizacao_id !== req.utilizador.organizacao_id) {
      return res.status(404).json({ error: "Anexo nao encontrado" });
    }

    if (!anexo.comunicado.publicado && !isGestor(req)) {
      return res.status(403).json({ error: "Comunicado nao disponivel" });
    }

    var b64 = extrairBase64(anexo.dados);
    var buffer = Buffer.from(b64, "base64");

    res.setHeader("Content-Type", anexo.tipo || "application/octet-stream");
    res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(anexo.nome || "anexo"));
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  } catch (e) {
    console.log("Erro ao descarregar anexo:", e.message);
    return res.status(500).json({ error: "Erro ao descarregar anexo" });
  }
};

module.exports = { list, get, create, update, remove, togglePublicado, downloadAnexo, destinatarios };
