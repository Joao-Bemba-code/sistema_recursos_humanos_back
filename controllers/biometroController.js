var { Op } = require("sequelize");
var { PicagemBiometrico, Colaborador, RegistoPresenca } = require("../models");

// Horario de trabalho (configuravel por env): entrada 08:00, saida 16:00.
// Quem entra depois da hora de entrada fica "Atrasado" e a saida esperada
// prolonga o tempo do atraso (ex.: entra 08:40 -> saida esperada 16:40).
var HORARIO_ENTRADA = (process.env.HORARIO_ENTRADA || "08:00").slice(0, 5);
var HORARIO_SAIDA = (process.env.HORARIO_SAIDA || "16:00").slice(0, 5);

// Converte "HH:MM" em minutos desde a meia-noite
var paraMinutos = function (hora) {
  if (!hora) return null;
  var partes = String(hora).split(":");
  var h = parseInt(partes[0], 10);
  var m = parseInt(partes[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};

// Converte minutos em "HH:MM"
var deMinutos = function (minutos) {
  var h = Math.floor(minutos / 60) % 24;
  var m = minutos % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
};

// Classifica o estado pela hora de entrada: depois da hora definida = Atrasado
var classificarEstado = function (horaEntrada) {
  var minutosEntrada = paraMinutos(horaEntrada);
  var minutosLimite = paraMinutos(HORARIO_ENTRADA);
  if (minutosEntrada === null || minutosLimite === null) return "Presente";
  return minutosEntrada > minutosLimite ? "Atrasado" : "Presente";
};

// Observacao automatica: indica o atraso e a saida esperada (prolongamento)
var observacaoAutomatica = function (horaEntrada) {
  var minutosEntrada = paraMinutos(horaEntrada);
  var minutosLimite = paraMinutos(HORARIO_ENTRADA);
  var minutosSaida = paraMinutos(HORARIO_SAIDA);
  if (minutosEntrada === null || minutosLimite === null || minutosSaida === null) {
    return "Registo automático do biómetro";
  }
  if (minutosEntrada <= minutosLimite) {
    return "Registo automático do biómetro";
  }
  var atraso = minutosEntrada - minutosLimite;
  var jornada = minutosSaida - minutosLimite;
  if (jornada < 0) jornada += 24 * 60;
  var saidaEsperada = deMinutos(minutosEntrada + jornada);
  return "Registo automático do biómetro — Atraso de " + atraso + " min (saída esperada " + saidaEsperada + ")";
};

// Formata uma Date para "HH:MM:SS" (hora local do servidor)
var horaLocal = function (d) {
  var h = String(d.getHours()).padStart(2, "0");
  var m = String(d.getMinutes()).padStart(2, "0");
  var s = String(d.getSeconds()).padStart(2, "0");
  return h + ":" + m + ":" + s;
};

// Formata uma Date para "YYYY-MM-DD" (data local do servidor)
var dataLocal = function (d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var dia = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + dia;
};

var calcularHorasTrabalhadas = function (horaEntrada, horaSaida) {
  if (!horaEntrada || !horaSaida) return null;
  var entrada = new Date("1970-01-01T" + horaEntrada);
  var saida = new Date("1970-01-01T" + horaSaida);
  var diff = (saida - entrada) / (1000 * 60 * 60);
  if (diff < 0) diff += 24;
  return Math.round(diff * 100) / 100;
};

// Sincroniza um lote de picagens vindas da ponte do biometro.
// Autenticacao: token da ponte (x-bridge-token) ou JWT com modulo assiduidade (feito no router).
var sincronizar = async function (req, res) {
  try {
    var picagens = req.body && req.body.picagens;
    if (!Array.isArray(picagens) || picagens.length === 0) {
      return res.status(400).json({ error: "Esperado um array 'picagens' nao vazio" });
    }
    if (picagens.length > 10000) {
      return res.status(400).json({ error: "Lote demasiado grande (maximo 10000 picagens)" });
    }

    var recebidas = picagens.length;
    var novas = 0;
    var duplicadas = 0;
    var semMapeamento = 0;
    var idsNovos = [];

    // 1) Guardar picagens (dedup pela chave unica id_biometrico + data_hora)
    for (var i = 0; i < picagens.length; i++) {
      var p = picagens[i];
      var idBio = (p.id_biometrico || p.userId || "").toString().trim();
      var dataHora = new Date(p.data_hora || p.recordTime);
      if (!idBio || isNaN(dataHora.getTime())) {
        continue;
      }
      try {
        var nova = await PicagemBiometrico.create({
          id_biometrico: idBio,
          colaborador_id: null,
          data_hora: dataHora,
          tipo: p.tipo !== undefined && p.tipo !== null ? parseInt(p.tipo, 10) : null,
          raw: (JSON.stringify(p) || "").slice(0, 490),
          processada: false,
        });
        novas++;
        idsNovos.push(nova.id);
      } catch (e) {
        if (e.name === "SequelizeUniqueConstraintError") {
          duplicadas++;
        } else {
          console.log("Erro ao guardar picagem:", e.message);
        }
      }
    }

    if (novas === 0) {
      return res.status(200).json({
        mensagem: "Nenhuma picagem nova",
        recebidas: recebidas,
        novas: 0,
        duplicadas: duplicadas,
        sem_mapeamento: 0,
        registos_criados: 0,
        registos_actualizados: 0,
        ausentes_criados: 0,
      });
    }

    // 2) Mapear id_biometrico -> colaborador
    var colaboradores = await Colaborador.findAll({
      where: { id_biometrico: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] } },
      attributes: ["id", "nome_completo", "numero_colaborador", "id_biometrico", "estado", "data_admissao"],
    });
    var mapa = {};
    for (var j = 0; j < colaboradores.length; j++) {
      mapa[colaboradores[j].id_biometrico.toString().trim()] = colaboradores[j];
    }

    // 3) Processar picagens por (colaborador, data)
    var registosCriados = 0;
    var registosActualizados = 0;

    // Agrupar as novas picagens
    var novasPicagens = await PicagemBiometrico.findAll({ where: { id: { [Op.in]: idsNovos } }, order: [["data_hora", "ASC"]] });
    var grupos = {}; // chave: colabId|data -> { datas: [Date...], ids: [picagem ids] }
    for (var k = 0; k < novasPicagens.length; k++) {
      var np = novasPicagens[k];
      var colab = mapa[np.id_biometrico];
      if (!colab) {
        semMapeamento++;
        continue;
      }
      np.colaborador_id = colab.id;
      var chave = colab.id + "|" + dataLocal(np.data_hora);
      if (!grupos[chave]) grupos[chave] = { colab: colab, data: dataLocal(np.data_hora), datas: [], ids: [] };
      grupos[chave].datas.push(new Date(np.data_hora));
      grupos[chave].ids.push(np.id);
    }

    var chavesGrupo = Object.keys(grupos);
    for (var g = 0; g < chavesGrupo.length; g++) {
      var grupo = grupos[chavesGrupo[g]];
      grupo.datas.sort(function (a, b) { return a - b; });
      var entrada = horaLocal(grupo.datas[0]);
      var saida = grupo.datas.length > 1 ? horaLocal(grupo.datas[grupo.datas.length - 1]) : null;

      var existente = await RegistoPresenca.findOne({
        where: { colaborador_id: grupo.colab.id, data: grupo.data },
      });

      if (!existente) {
        await RegistoPresenca.create({
          colaborador_id: grupo.colab.id,
          data: grupo.data,
          hora_entrada: entrada,
          hora_saida: saida,
          horas_trabalhadas: calcularHorasTrabalhadas(entrada, saida),
          horas_extras: 0,
          estado: classificarEstado(entrada),
          metodo: "Biometrico",
          observacoes: observacaoAutomatica(entrada),
        });
        registosCriados++;
      } else {
        // Registo manual nao e alterado pelo biometro
        if (existente.metodo === "Manual") {
          await PicagemBiometrico.update({ processada: true }, { where: { id: { [Op.in]: grupo.ids } } });
          continue;
        }
        var novaEntrada = existente.hora_entrada;
        var novaSaida = existente.hora_saida;
        if (!novaEntrada || (novaEntrada && entrada < novaEntrada)) novaEntrada = entrada;
        if (!novaSaida || (novaSaida && saida && saida > novaSaida)) novaSaida = saida;
        // Estado automatico: Ausente/Atrasado/Presente sao recalculados pelo biometro;
        // estados manuais como Licenca/Ferias sao preservados.
        var novoEstado = existente.estado;
        if (existente.estado === "Ausente" || existente.estado === "Atrasado" || existente.estado === "Presente") {
          novoEstado = classificarEstado(novaEntrada);
        }
        var novaObs = existente.observacoes;
        if (!novaObs || novaObs.indexOf("Registo automático") !== -1) {
          novaObs = observacaoAutomatica(novaEntrada);
        }
        await existente.update({
          hora_entrada: novaEntrada,
          hora_saida: novaSaida,
          horas_trabalhadas: calcularHorasTrabalhadas(novaEntrada, novaSaida),
          metodo: existente.metodo === "Biometrico" ? "Biometrico" : existente.metodo,
          estado: novoEstado,
          observacoes: novaObs,
        });
        registosActualizados++;
      }

      await PicagemBiometrico.update({ processada: true }, { where: { id: { [Op.in]: grupo.ids } } });
    }

    // Marcar colaborador_id nas picagens mapeadas (para consulta)
    if (novasPicagens.length > 0) {
      for (var m = 0; m < novasPicagens.length; m++) {
        if (novasPicagens[m].colaborador_id) {
          await novasPicagens[m].update({ colaborador_id: novasPicagens[m].colaborador_id });
        }
      }
    }

    // 4) "Ausente" automatico: colaboradores mapeados, activos, dias uteis (seg-sex)
    // dos ultimos 7 dias sem nenhuma picagem e sem registo de presenca
    var ausentesCriados = await marcarAusentesAutomaticos(colaboradores);

    return res.status(200).json({
      mensagem: "Picagens sincronizadas",
      recebidas: recebidas,
      novas: novas,
      duplicadas: duplicadas,
      sem_mapeamento: semMapeamento,
      registos_criados: registosCriados,
      registos_actualizados: registosActualizados,
      ausentes_criados: ausentesCriados,
    });
  } catch (e) {
    console.log("Erro ao sincronizar picagens:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Cria o registo "Ausente" (metodo Biometrico) para o dia de HOJE quando um
// colaborador mapeado e activo ainda nao tem picagem nem registo de presenca.
// So o proprio dia (sem olhar para tras) — decisao do utilizador: o biometro
// comeca a contar "de hoje em diante", para nao inventar faltas do passado.
var marcarAusentesAutomaticos = async function (colaboradores) {
  var criados = 0;
  var hoje = new Date();
  var diaSemana = hoje.getDay(); // 0=domingo, 6=sabado
  if (diaSemana === 0 || diaSemana === 6) return 0;

  var dataStr = dataLocal(hoje);

  for (var i = 0; i < colaboradores.length; i++) {
    var colab = colaboradores[i];
    if (colab.estado !== "Activo") continue;

    // Nao marcar antes da admissao
    if (colab.data_admissao && dataStr < colab.data_admissao) continue;

    var temPicagem = await PicagemBiometrico.findOne({
      where: { id_biometrico: colab.id_biometrico, data_hora: { [Op.gte]: new Date(dataStr + "T00:00:00"), [Op.lt]: new Date(dataStr + "T23:59:59.999") } },
    });
    if (temPicagem) continue;

    var temRegisto = await RegistoPresenca.findOne({
      where: { colaborador_id: colab.id, data: dataStr },
    });
    if (temRegisto) continue;

    try {
      await RegistoPresenca.create({
        colaborador_id: colab.id,
        data: dataStr,
        hora_entrada: null,
        hora_saida: null,
        horas_trabalhadas: null,
        horas_extras: 0,
        estado: "Ausente",
        metodo: "Biometrico",
        observacoes: "Falta automática: sem picagem no biómetro",
      });
      criados++;
    } catch (e) {
      if (e.name !== "SequelizeUniqueConstraintError") {
        console.log("Erro ao marcar ausente automatico:", e.message);
      }
    }
  }

  return criados;
};

// Lista colaboradores com mapeamento biometrico (para a ponte e para o admin)
var mapeamento = async function (req, res) {
  try {
    var todos = req.query.todos === "1" || req.query.todos === "true";
    var where = todos ? {} : { id_biometrico: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] } };
    if (req.organizacao_id) where.organizacao_id = req.organizacao_id;

    var colaboradores = await Colaborador.findAll({
      where: where,
      attributes: ["id", "nome_completo", "numero_colaborador", "id_biometrico", "estado"],
      order: [["nome_completo", "ASC"]],
    });

    return res.status(200).json({ dados: colaboradores });
  } catch (e) {
    console.log("Erro ao listar mapeamento biometrico:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Lista picagens recebidas (diagnostico / admin)
var picagens = async function (req, res) {
  try {
    var page = parseInt(req.query.page) || 1;
    var limit = parseInt(req.query.limit) || 30;
    var offset = (page - 1) * limit;
    var id_biometrico = req.query.id_biometrico;

    var where = {};
    if (id_biometrico) where.id_biometrico = id_biometrico;

    var { count, rows } = await PicagemBiometrico.findAndCountAll({
      where: where,
      include: [{ model: Colaborador, as: "colaborador", attributes: ["id", "nome_completo", "numero_colaborador"] }],
      order: [["data_hora", "DESC"]],
      limit: limit,
      offset: offset,
    });

    return res.status(200).json({
      dados: rows,
      paginacao: { total: count, pagina: page, limite: limit, total_paginas: Math.ceil(count / limit) },
    });
  } catch (e) {
    console.log("Erro ao listar picagens:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { sincronizar, mapeamento, picagens };
