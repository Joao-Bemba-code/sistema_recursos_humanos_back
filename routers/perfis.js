var { Op } = require("sequelize");
var express = require("express");
var router = express.Router();
var { Perfil, Utilizador, UtilizadorPerfil } = require("../models");
var { requireRole, normalizarPermissoes } = require("../protect/rbac");

var MODULOS_SISTEMA = [
  { chave: "colaboradores", nome: "Colaboradores" },
  { chave: "contratos", nome: "Contratos" },
  { chave: "departamentos", nome: "Departamentos" },
  { chave: "assiduidade", nome: "Assiduidade" },
  { chave: "faltas", nome: "Faltas e Atrasos" },
  { chave: "ferias", nome: "Férias" },
  { chave: "avaliacao", nome: "Avaliação" },
  { chave: "formacao", nome: "Formação" },
  { chave: "folha_salarial", nome: "Folha Salarial" },
  { chave: "pedidos", nome: "Pedidos" },
  { chave: "advertencias", nome: "Advertências" },
  { chave: "utilizadores", nome: "Utilizadores" },
  { chave: "relatorios", nome: "Relatórios" },
  { chave: "configuracoes", nome: "Configurações" },
  { chave: "portal", nome: "Portal" },
];

router.get("/", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), async function (req, res) {
  try {
    var perfis = await Perfil.findAll({
      order: [["nivel", "DESC"], ["nome", "ASC"]],
    });

    var perfisComStats = await Promise.all(perfis.map(async function (perfil) {
      var count = await Utilizador.count({ where: { perfil_id: perfil.id, activo: true } });
      var countExtra = await UtilizadorPerfil.count({ where: { perfil_id: perfil.id } });
      return {
        id: perfil.id,
        nome: perfil.nome,
        descricao: perfil.descricao,
        nivel: perfil.nivel,
        permissoes: normalizarPermissoes(perfil.permissoes),
        activo: perfil.activo,
        total_utilizadores: count + countExtra,
      };
    }));

    return res.status(200).json({
      dados: perfisComStats,
      modulos: MODULOS_SISTEMA,
    });
  } catch (e) {
    console.log("Erro ao listar perfis:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.get("/:id", requireRole("Administrador Geral", "Director Geral", "Director de Recursos Humanos"), async function (req, res) {
  try {
    var perfil = await Perfil.findByPk(req.params.id);
    if (!perfil) {
      return res.status(404).json({ error: "Perfil não encontrado" });
    }

    var utilizadores = await Utilizador.findAll({
      where: { perfil_id: perfil.id },
      attributes: ["id", "nome_completo", "email", "activo"],
      order: [["nome_completo", "ASC"]],
    });

    // Utilizadores com este perfil como perfil adicional
    var linhasExtra = await UtilizadorPerfil.findAll({ where: { perfil_id: perfil.id } });
    var idsExtra = linhasExtra.map(function (r) { return r.utilizador_id; });
    if (idsExtra.length > 0) {
      var extras = await Utilizador.findAll({
        where: { id: { [Op.in]: idsExtra }, perfil_id: { [Op.ne]: perfil.id } },
        attributes: ["id", "nome_completo", "email", "activo"],
        order: [["nome_completo", "ASC"]],
      });
      var idsVisiveis = {};
      utilizadores.forEach(function (u) { idsVisiveis[u.id] = true; });
      extras.forEach(function (u) {
        if (!idsVisiveis[u.id]) utilizadores.push(u);
      });
    }

    return res.status(200).json({
      dados: {
        id: perfil.id,
        nome: perfil.nome,
        descricao: perfil.descricao,
        nivel: perfil.nivel,
        permissoes: normalizarPermissoes(perfil.permissoes),
        activo: perfil.activo,
        utilizadores: utilizadores,
      },
      modulos: MODULOS_SISTEMA,
    });
  } catch (e) {
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.put("/:id", requireRole("Administrador Geral"), async function (req, res) {
  try {
    var perfil = await Perfil.findByPk(req.params.id);
    if (!perfil) {
      return res.status(404).json({ error: "Perfil não encontrado" });
    }

    var dadosActualizar = {};
    if (req.body.nome !== undefined) dadosActualizar.nome = req.body.nome;
    if (req.body.descricao !== undefined) dadosActualizar.descricao = req.body.descricao;
    if (req.body.nivel !== undefined) dadosActualizar.nivel = req.body.nivel;
    if (req.body.permissoes !== undefined) dadosActualizar.permissoes = normalizarPermissoes(req.body.permissoes);
    if (req.body.activo !== undefined) dadosActualizar.activo = req.body.activo;

    await perfil.update(dadosActualizar);

    return res.status(200).json({
      mensagem: "Perfil actualizado com sucesso",
      dados: {
        id: perfil.id,
        nome: perfil.nome,
        descricao: perfil.descricao,
        nivel: perfil.nivel,
        permissoes: normalizarPermissoes(perfil.permissoes),
        activo: perfil.activo,
      },
    });
  } catch (e) {
    console.log("Erro ao actualizar perfil:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

router.post("/", requireRole("Administrador Geral"), async function (req, res) {
  try {
    var { nome, descricao, nivel, permissoes } = req.body;

    if (!nome) {
      return res.status(400).json({ error: "Nome do perfil é obrigatório" });
    }

    var existente = await Perfil.findOne({ where: { nome: nome } });
    if (existente) {
      return res.status(409).json({ error: "Já existe um perfil com este nome" });
    }

    var novoPerfil = await Perfil.create({
      nome: nome,
      descricao: descricao || "",
      nivel: nivel || 0,
      permissoes: normalizarPermissoes(permissoes || {}),
    });

    return res.status(201).json({
      mensagem: "Perfil criado com sucesso",
      dados: novoPerfil,
    });
  } catch (e) {
    console.log("Erro ao criar perfil:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
});

module.exports = router;
