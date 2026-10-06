var { Op } = require("sequelize");
var { Colaborador, EscalaSemanal } = require("../models");
var biometroController = require("./biometroController");

// Valida "HH:MM" (ou vazio/nulo = descanso). Devolve a hora normalizada,
// false se o formato e invalido, null se vazio.
var validarHora = function (texto) {
  if (texto === null || texto === undefined || texto === "") return null;
  var s = String(texto);
  if (!/^\d{2}:\d{2}$/.test(s)) return false;
  var partes = s.split(":");
  var h = parseInt(partes[0], 10);
  var m = parseInt(partes[1], 10);
  if (isNaN(h) || isNaN(m) || h > 23 || m > 59) return false;
  return s;
};

// Lista todos os colaboradores com a escala semanal de 7 dias (0=domingo ...
// 6=sabado). Quem ainda nao tem escala gravada mostra o fallback (dias_descanso
// da ficha + horario global 08:00/16:00) com a flag tem_escala=false.
var list = async function (req, res) {
  try {
    var where = {};
    if (req.organizacao_id) where.organizacao_id = req.organizacao_id;

    var colaboradores = await Colaborador.findAll({
      where: where,
      attributes: ["id", "nome_completo", "numero_colaborador", "id_biometrico", "estado", "dias_descanso"],
      order: [["nome_completo", "ASC"]],
    });

    var ids = colaboradores.map(function (c) { return c.id; });
    var porColab = {};
    if (ids.length > 0) {
      var linhas = await EscalaSemanal.findAll({ where: { colaborador_id: { [Op.in]: ids } } });
      for (var i = 0; i < linhas.length; i++) {
        if (!porColab[linhas[i].colaborador_id]) porColab[linhas[i].colaborador_id] = {};
        porColab[linhas[i].colaborador_id][linhas[i].dia_semana] = {
          hora_entrada: linhas[i].hora_entrada || null,
          hora_saida: linhas[i].hora_saida || null,
        };
      }
    }

    var dados = colaboradores.map(function (c) {
      var linhasColab = porColab[c.id] || {};
      var temEscala = Object.keys(linhasColab).length > 0;
      var dias = [];
      for (var d = 0; d < 7; d++) {
        if (temEscala) {
          var linha = linhasColab[d];
          dias.push({
            dia_semana: d,
            hora_entrada: linha ? (linha.hora_entrada || null) : null,
            hora_saida: linha ? (linha.hora_saida || null) : null,
          });
        } else {
          var fb = biometroController.escalaFallback(c, d);
          dias.push({
            dia_semana: d,
            hora_entrada: fb ? fb.entrada : null,
            hora_saida: fb ? fb.saida : null,
          });
        }
      }
      return {
        colaborador_id: c.id,
        nome_completo: c.nome_completo,
        numero_colaborador: c.numero_colaborador,
        id_biometrico: c.id_biometrico,
        estado: c.estado,
        tem_escala: temEscala,
        dias: dias,
      };
    });

    return res.status(200).json({ dados: dados });
  } catch (e) {
    console.log("Erro ao listar escalas:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Guarda a escala semanal de um colaborador: body { dias: [{dia_semana,
// hora_entrada, hora_saida}] }. As duas horas preenchidas = dia de trabalho
// (pode passar da meia-noite, ex.: 20:00-04:00); as duas vazias = descanso.
// Depois de guardar, reclassifica o mes corrente: "Ausente" automaticos de
// dias que passaram a ser descanso sao removidos.
var update = async function (req, res) {
  try {
    var colab = await Colaborador.findByPk(req.params.colaboradorId);
    if (!colab) {
      return res.status(404).json({ error: "Colaborador não encontrado" });
    }

    var dias = req.body && req.body.dias;
    if (!Array.isArray(dias) || dias.length === 0 || dias.length > 7) {
      return res.status(400).json({ error: "Envie a escala em 'dias' (até 7 dias da semana)" });
    }

    var vistos = {};
    var normalizado = [];
    for (var i = 0; i < dias.length; i++) {
      var d = dias[i];
      var diaSemana = parseInt(d.dia_semana, 10);
      if (isNaN(diaSemana) || diaSemana < 0 || diaSemana > 6) {
        return res.status(400).json({ error: "dia_semana tem de ser 0 (domingo) a 6 (sábado)" });
      }
      if (vistos[diaSemana]) {
        return res.status(400).json({ error: "Dia da semana repetido na escala" });
      }
      vistos[diaSemana] = true;
      var entrada = validarHora(d.hora_entrada);
      var saida = validarHora(d.hora_saida);
      if (entrada === false || saida === false) {
        return res.status(400).json({ error: "Horas inválidas. Use o formato HH:MM (ex.: 08:00)" });
      }
      if ((entrada === null) !== (saida === null)) {
        return res.status(400).json({ error: "Preencha as duas horas ou nenhuma (nenhuma = dia de descanso)" });
      }
      normalizado.push({ dia_semana: diaSemana, hora_entrada: entrada, hora_saida: saida });
    }

    // Substitui a escala: apaga as linhas actuais e grava so os dias de trabalho
    // (dias de descanso ficam sem linha — a ausencia de linha = descanso).
    await EscalaSemanal.destroy({ where: { colaborador_id: colab.id } });
    for (var j = 0; j < normalizado.length; j++) {
      if (normalizado[j].hora_entrada === null && normalizado[j].hora_saida === null) continue;
      await EscalaSemanal.create({
        colaborador_id: colab.id,
        dia_semana: normalizado[j].dia_semana,
        hora_entrada: normalizado[j].hora_entrada,
        hora_saida: normalizado[j].hora_saida,
      });
    }

    // Reclassifica o mes corrente: dias que passaram a ser descanso perdem o
    // "Ausente" automatico; dias que passaram a ser trabalho ganham-no (via
    // proximo sync, se nao tiverem picagem).
    var resultado = { actualizados: 0, removidos: 0 };
    try {
      resultado = await biometroController.reclassificarAutomaticos();
    } catch (reclassErr) {
      console.log("Aviso ao reclassificar apos guardar escala:", reclassErr.message);
    }

    return res.status(200).json({
      mensagem: "Escala guardada com sucesso",
      reclassificados: resultado.actualizados,
      ausentes_removidos: resultado.removidos,
    });
  } catch (e) {
    console.log("Erro ao guardar escala:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { list, update };
