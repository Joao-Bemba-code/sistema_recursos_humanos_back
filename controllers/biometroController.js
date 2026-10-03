var { Op } = require("sequelize");
var { PicagemBiometrico, Colaborador, RegistoPresenca } = require("../models");

// Horario de trabalho (configuravel por env): entrada 08:00, saida 16:00.
// Ha uma TOLERANCIA de entrada (por omissao 40 min): quem entra ate as 08:40
// ainda conta como "Presente"; so depois disso fica "Atrasado".
// A saida esperada prolonga o tempo do atraso (ex.: entra 08:40 -> sai 16:40).
// Enquanto o dia de hoje esta a decorrer (ja tem entrada, ainda sem saida) o
// estado e "Em_Curso" — nao e Presente nem Atrasado, porque ainda pode mudar.
var HORARIO_ENTRADA = (process.env.HORARIO_ENTRADA || "08:00").slice(0, 5);
var HORARIO_SAIDA = (process.env.HORARIO_SAIDA || "16:00").slice(0, 5);
var TOLERANCIA_MINUTOS = parseInt(process.env.TOLERANCIA_ENTRADA || "40", 10);
if (isNaN(TOLERANCIA_MINUTOS) || TOLERANCIA_MINUTOS < 0) TOLERANCIA_MINUTOS = 40;
// Separacao minima (minutos) entre a entrada e a seguinte picagem para essa
// picagem contar como SAIDA. Sem isto, duas picagens seguidas de manha
// (ex.: 07:55 e 08:03) eram lidas como entrada + saida.
var MINUTOS_SAIDA = parseInt(process.env.MINUTOS_SAIDA || "60", 10);
if (isNaN(MINUTOS_SAIDA) || MINUTOS_SAIDA < 1) MINUTOS_SAIDA = 60;
// Marcador de versao devolvido nas respostas da API. Permite confirmar (num
// deploy em producao) que a correccao das horas de saida ja esta activa.
var VERSAO_ALGORITMO = "saida-2";

// Converte "HH:MM" (ou "HH:MM:SS") em minutos desde a meia-noite — ignora os
// segundos, para a tolerancia ser contada por minuto inteiro (08:40:15 = 08:40).
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

// O dia ainda esta a decorrer? (estado provisorio: tem entrada, ainda sem saida)
var diaEmCurso = function (data, temSaida) {
  if (temSaida) return false;
  return !data || data === dataLocal(new Date());
};

// Classifica o estado:
//   - sem hora de entrada                -> Ausente
//   - dia de hoje ainda sem hora de saida -> Em_Curso (provisorio, pode mudar)
//   - entrada depois da hora + tolerancia -> Atrasado
//   - resto                              -> Presente
var classificarEstado = function (horaEntrada, temSaida, data) {
  var minutosEntrada = paraMinutos(horaEntrada);
  if (minutosEntrada === null) return "Ausente";
  if (diaEmCurso(data, temSaida)) return "Em_Curso";
  var minutosLimite = paraMinutos(HORARIO_ENTRADA);
  if (minutosLimite === null) return "Presente";
  return minutosEntrada > minutosLimite + TOLERANCIA_MINUTOS ? "Atrasado" : "Presente";
};

// Observacao automatica: indica o atraso e a saida esperada (prolongamento)
var observacaoAutomatica = function (horaEntrada, temSaida, data) {
  var minutosEntrada = paraMinutos(horaEntrada);
  var minutosLimite = paraMinutos(HORARIO_ENTRADA);
  var minutosSaida = paraMinutos(HORARIO_SAIDA);
  if (minutosEntrada === null) return "Registo automático do biómetro";
  if (diaEmCurso(data, temSaida)) return "Registo automático do biómetro — em curso (ainda sem hora de saída)";
  if (minutosLimite === null || minutosSaida === null) return "Registo automático do biómetro";
  if (minutosEntrada <= minutosLimite + TOLERANCIA_MINUTOS) return "Registo automático do biómetro";
  var atraso = minutosEntrada - (minutosLimite + TOLERANCIA_MINUTOS);
  var jornada = minutosSaida - minutosLimite;
  if (jornada < 0) jornada += 24 * 60;
  var saidaEsperada = deMinutos(minutosEntrada + jornada);
  return "Registo automático do biómetro — Atraso de " + atraso + " min (saída esperada " + saidaEsperada + ")";
};

// A observacao foi escrita pelo biometro (pode ser reescrita) ou pelo RH (nao se toca)?
var ehObservacaoAutomatica = function (texto) {
  if (!texto) return true;
  return String(texto).indexOf("automático do biómetro") !== -1;
};

// Descobre a entrada e a saida de um dia a partir das picagens.
// As picagens chegam por lotes (por vezes so uma), por isso nao se pode assumir
// que a ultima do lote e' a saida: so passa a saida se estiver pelo menos
// MINUTOS_SAIDA depois da entrada.
// NOTA: o tipo do aparelho (0=entrada, 1=saida) NAO e' usado — nos ZKTeco
// testados devolve sempre 1, mesmo nas picagens de entrada da manha.
var atribuirHorarios = function (entradaActual, saidaActual, picagensOrdenadas) {
  var entrada = entradaActual || null;
  var saida = saidaActual || null;

  for (var i = 0; i < picagensOrdenadas.length; i++) {
    var p = picagensOrdenadas[i];
    var minutos = paraMinutos(p.hora);
    if (minutos === null) continue;

    if (!entrada) {
      entrada = p.hora;
      continue;
    }
    var minutosEntrada = paraMinutos(entrada);
    if (minutosEntrada === null) continue;

    if (minutos < minutosEntrada) {
      entrada = p.hora; // chegou mais cedo do que se pensava
      continue;
    }

    var minutosSaida = saida ? paraMinutos(saida) : null;
    if (minutosSaida !== null && minutos <= minutosSaida) continue; // ja temos saida mais tarde

    if (minutos - minutosEntrada >= MINUTOS_SAIDA) {
      saida = p.hora;
    }
  }

  return { entrada: entrada, saida: saida };
};


// Formata uma Date para "HH:MM:SS" (hora local do servidor)
var horaLocal = function (d) {
  var h = String(d.getHours()).padStart(2, "0");
  var m = String(d.getMinutes()).padStart(2, "0");
  var s = String(d.getSeconds()).padStart(2, "0");
  return h + ":" + m + ":" + s;
};

// Formata uma Date para "YYYY-MM-DD" (data local do servidor)
// Aceita tambem o texto "YYYY-MM-DD" devolvido pelas colunas DATEONLY
var dataLocal = function (d) {
  if (!(d instanceof Date)) {
    d = new Date(String(d).slice(0, 10) + "T00:00:00");
  }
  if (isNaN(d.getTime())) return null;
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var dia = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + dia;
};

// Chave "id|data" para comparar dias (aceita Date ou "YYYY-MM-DD" do DATEONLY)
var chaveDia = function (id, data) {
  return id + "|" + (dataLocal(data) || String(data));
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
    if (!Array.isArray(picagens)) {
      return res.status(400).json({ error: "Esperado um array 'picagens'" });
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

    // Lote vazio: a ponte so quer que o servidor reclassifique os estados
    // (tolerancia de entrada / "Em curso" do dia de hoje), sem picagens novas.
    if (novas === 0) {
      var reclassificados = await reclassificarAutomaticos();
      return res.status(200).json({
        mensagem: "Nenhuma picagem nova",
        recebidas: recebidas,
        novas: 0,
        duplicadas: duplicadas,
        sem_mapeamento: 0,
        registos_criados: 0,
        registos_actualizados: 0,
        ausentes_criados: 0,
        reclassificados: reclassificados,
        versao_algoritmo: VERSAO_ALGORITMO,
      });
    }

    // 2) Mapear id_biometrico -> colaborador
    var colaboradores = await Colaborador.findAll({
      where: { id_biometrico: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] } },
      attributes: ["id", "nome_completo", "numero_colaborador", "id_biometrico", "estado", "data_admissao", "data_desligamento"],
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
      if (!grupos[chave]) grupos[chave] = { colab: colab, data: dataLocal(np.data_hora), datas: [], tipos: [], ids: [] };
      grupos[chave].datas.push(new Date(np.data_hora));
      grupos[chave].tipos.push(np.tipo === null || np.tipo === undefined ? null : parseInt(np.tipo, 10));
      grupos[chave].ids.push(np.id);
    }

    var chavesGrupo = Object.keys(grupos);
    for (var g = 0; g < chavesGrupo.length; g++) {
      var grupo = grupos[chavesGrupo[g]];
      grupo.datas.sort(function (a, b) { return a - b; });

      var picagensOrdenadas = grupo.datas.map(function (d, indice) {
        return { hora: horaLocal(d), tipo: grupo.tipos[indice] };
      });

      var existente = await RegistoPresenca.findOne({
        where: { colaborador_id: grupo.colab.id, data: grupo.data },
      });

      // Entrada e saida do dia, juntando as picagens novas com o que ja existe
      var horarios = atribuirHorarios(
        existente ? existente.hora_entrada : null,
        existente ? existente.hora_saida : null,
        picagensOrdenadas
      );
      var entrada = horarios.entrada;
      var saida = horarios.saida;

      if (!existente) {
        await RegistoPresenca.create({
          colaborador_id: grupo.colab.id,
          data: grupo.data,
          hora_entrada: entrada,
          hora_saida: saida,
          horas_trabalhadas: calcularHorasTrabalhadas(entrada, saida),
          horas_extras: 0,
          estado: classificarEstado(entrada, !!saida, grupo.data),
          metodo: "Biometrico",
          observacoes: observacaoAutomatica(entrada, !!saida, grupo.data),
        });
        registosCriados++;
      } else {
        // Registo corrigido a mao pelo RH (metodo Manual ou ajustado_manual): o
        // biometro nao lhe toca mais, para nao voltar a trocar o que o RH corrigiu
        // (ex.: esqueceu-se de meter o dedo e o RH passou a entrada a mao).
        if (existente.metodo === "Manual" || existente.ajustado_manual) {
          await PicagemBiometrico.update({ processada: true }, { where: { id: { [Op.in]: grupo.ids } } });
          continue;
        }
        // Estado automatico: Ausente/Atrasado/Presente/Em_Curso sao recalculados pelo
        // biometro; estados manuais como Licenca/Ferias sao preservados.
        var novoEstado = existente.estado;
        if (existente.estado === "Ausente" || existente.estado === "Atrasado" || existente.estado === "Presente" || existente.estado === "Em_Curso") {
          novoEstado = classificarEstado(entrada, !!saida, grupo.data);
        }
        var novaObs = existente.observacoes;
        if (ehObservacaoAutomatica(novaObs)) {
          novaObs = observacaoAutomatica(entrada, !!saida, grupo.data);
        }
        await existente.update({
          hora_entrada: entrada,
          hora_saida: saida,
          horas_trabalhadas: calcularHorasTrabalhadas(entrada, saida),
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

    // 5) Reclassificar os registos do mes corrente (tolerancia / "Em curso").
    // Correge tambem registos que ficaram com estado antigo porque nao houve
    // picagens novas (ex.: registos de hoje que ainda nao tem hora de saida).
    var reclassificados = await reclassificarAutomaticos();

    return res.status(200).json({
      mensagem: "Picagens sincronizadas",
      recebidas: recebidas,
      novas: novas,
      duplicadas: duplicadas,
      sem_mapeamento: semMapeamento,
      registos_criados: registosCriados,
      registos_actualizados: registosActualizados,
      ausentes_criados: ausentesCriados,
      reclassificados: reclassificados,
      versao_algoritmo: VERSAO_ALGORITMO,
    });
  } catch (e) {
    console.log("Erro ao sincronizar picagens:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Cria o registo "Ausente" (metodo Biometrico) para os DIAS UTEIS (seg-sex) desde
// o dia 1 do mes actual ate hoje, quando um colaborador mapeado e activo nao tem
// picagem nem registo de presenca nesse dia.
// A assiduidade so conta a partir do dia 1 do mes: dias anteriores ficam de fora
// (o biometro comeca a contar "de hoje para tras dentro do mes").
// Registo ja corrigido a mao pelo RH conta como existente e nunca e mexido.
var marcarAusentesAutomaticos = async function (colaboradores) {
  if (!colaboradores || colaboradores.length === 0) return 0;

  var hoje = new Date();
  var diasUteis = [];
  var dia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  while (dia <= hoje) {
    var diaSemana = dia.getDay(); // 0=domingo, 6=sabado
    if (diaSemana !== 0 && diaSemana !== 6) diasUteis.push(dataLocal(dia));
    dia.setDate(dia.getDate() + 1);
  }
  if (diasUteis.length === 0) return 0;

  var inicioMes = diasUteis[0];
  var fimMes = diasUteis[diasUteis.length - 1];

  // 1) Uma consulta: picagens do mes (para saber quem passou o dedo)
  var picagensMes = await PicagemBiometrico.findAll({
    attributes: ["id_biometrico", "data_hora"],
    where: {
      id_biometrico: { [Op.in]: colaboradores.map(function (c) { return c.id_biometrico; }) },
      data_hora: { [Op.gte]: new Date(inicioMes + "T00:00:00"), [Op.lte]: new Date(fimMes + "T23:59:59") },
    },
  });
  var comPicagem = {};
  for (var p = 0; p < picagensMes.length; p++) {
    comPicagem[chaveDia(picagensMes[p].id_biometrico, picagensMes[p].data_hora)] = true;
  }

  // 2) Uma consulta: registos de presenca ja existentes no mes
  var registosMes = await RegistoPresenca.findAll({
    attributes: ["colaborador_id", "data"],
    where: {
      colaborador_id: { [Op.in]: colaboradores.map(function (c) { return c.id; }) },
      data: { [Op.between]: [inicioMes, fimMes] },
    },
  });
  var comRegisto = {};
  for (var r = 0; r < registosMes.length; r++) {
    comRegisto[chaveDia(registosMes[r].colaborador_id, registosMes[r].data)] = true;
  }

  // 3) Criar os "Ausente" em falta
  var criados = 0;
  for (var i = 0; i < colaboradores.length; i++) {
    var colab = colaboradores[i];
    if (colab.estado !== "Activo") continue;

    var admissao = colab.data_admissao ? dataLocal(colab.data_admissao) : null;
    var desligamento = colab.data_desligamento ? dataLocal(colab.data_desligamento) : null;

    for (var j = 0; j < diasUteis.length; j++) {
      var dataStr = diasUteis[j];
      // Nao marcar antes da admissao nem depois do desligamento
      if (admissao && dataStr < admissao) continue;
      if (desligamento && dataStr > desligamento) continue;
      if (comRegisto[chaveDia(colab.id, dataStr)]) continue;
      if (comPicagem[chaveDia(colab.id_biometrico, dataStr)]) continue;

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
        comRegisto[chaveDia(colab.id, dataStr)] = true;
        criados++;
      } catch (e) {
        if (e.name !== "SequelizeUniqueConstraintError") {
          console.log("Erro ao marcar ausente automatico:", e.message);
        }
      }
    }
  }

  return criados;
};

// Recalcula o estado dos registos biometricos do mes corrente, para reflectir
// a tolerancia de entrada e o estado provisorio "Em curso" do dia de hoje.
// Correccoes do RH (ajustado_manual, metodo Manual) e estados manuals como
// Licenca/Ferias/Fim_semana nunca sao tocados.
var reclassificarAutomaticos = async function () {
  var hoje = new Date();
  var inicioMes = dataLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  var inicioMesSql = inicioMes + "T00:00:00";

  var registos = await RegistoPresenca.findAll({
    attributes: ["id", "colaborador_id", "data", "hora_entrada", "hora_saida", "horas_trabalhadas", "estado", "observacoes"],
    where: {
      metodo: "Biometrico",
      ajustado_manual: { [Op.or]: [false, null] },
      data: { [Op.gte]: inicioMes },
    },
  });

  // 1) Recalcular entrada/saida a partir de TODAS as picagens ja gravadas.
  // Isto recupera as horas de saida que ficaram em falta (a picagem de saida
  // chegou sozinha num lote e, antes, era descartada).
  var idsColabs = {};
  registos.forEach(function (r) { idsColabs[r.colaborador_id] = true; });
  var listaIds = Object.keys(idsColabs);
  var picagensPorDia = {};
  if (listaIds.length > 0) {
    // O aparelho pode estar num fuso horario diferente do servidor (Luanda = UTC+1).
    // As picagens sao gravadas com a hora "de parede" do aparelho, portanto uma
    // picagem das 16:18 em Luanda fica como 16:18 UTC no servidor, ate ~1h no
    // futuro. Por isso o limite superior NAO pode ser "agora" (isso descartava
    // as picagens da tarde, e era por isso que as horas de saida nunca eram
    // reconstruidas). Usa-se o fim do dia corrente.
    var fimDoDia = new Date(dataLocal(hoje) + "T23:59:59.999");
    var picagens = await PicagemBiometrico.findAll({
      attributes: ["colaborador_id", "data_hora", "tipo"],
      where: {
        colaborador_id: { [Op.in]: listaIds },
        data_hora: { [Op.gte]: new Date(inicioMesSql), [Op.lte]: fimDoDia },
      },
      order: [["data_hora", "ASC"]],
    });
    picagens.forEach(function (p) {
      var chave = p.colaborador_id + "|" + dataLocal(p.data_hora);
      if (!picagensPorDia[chave]) picagensPorDia[chave] = [];
      picagensPorDia[chave].push({
        hora: horaLocal(p.data_hora),
        tipo: p.tipo === null || p.tipo === undefined ? null : parseInt(p.tipo, 10),
      });
    });
  }

  // 2) Aplicar entrada/saida + estado + observacao
  var actualizados = 0;
  for (var r = 0; r < registos.length; r++) {
    var registo = registos[r];
    var data = dataLocal(registo.data);

    var horarios = atribuirHorarios(
      registo.hora_entrada,
      registo.hora_saida,
      picagensPorDia[registo.colaborador_id + "|" + data] || []
    );
    var entrada = horarios.entrada;
    var saida = horarios.saida;
    var temSaida = !!saida;

    var novoEstado = registo.estado;
    if (registo.estado === "Ausente" || registo.estado === "Atrasado" || registo.estado === "Presente" || registo.estado === "Em_Curso") {
      novoEstado = classificarEstado(entrada, temSaida, data);
    }
    var novaObs = ehObservacaoAutomatica(registo.observacoes)
      ? observacaoAutomatica(entrada, temSaida, data)
      : registo.observacoes;
    var novasHoras = temSaida ? calcularHorasTrabalhadas(entrada, saida) : registo.horas_trabalhadas;

    if (
      novoEstado === registo.estado &&
      novaObs === registo.observacoes &&
      String(entrada || "") === String(registo.hora_entrada || "") &&
      String(saida || "") === String(registo.hora_saida || "") &&
      String(novasHoras === null || novasHoras === undefined ? "" : novasHoras) === String(registo.horas_trabalhadas === null || registo.horas_trabalhadas === undefined ? "" : registo.horas_trabalhadas)
    ) {
      continue;
    }
    await registo.update({
      hora_entrada: entrada,
      hora_saida: saida,
      horas_trabalhadas: novasHoras,
      estado: novoEstado,
      observacoes: novaObs,
    });
    actualizados++;
  }

  return actualizados;
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
