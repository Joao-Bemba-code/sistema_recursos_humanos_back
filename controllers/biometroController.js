var { Op } = require("sequelize");
var { PicagemBiometrico, Colaborador, RegistoPresenca, Feriado, EscalaSemanal } = require("../models");

// Horario de trabalho por omissao (configuravel por env): entrada 08:00, saida
// 16:00. Serve de FALLBACK para colaboradores sem escala semanal propria (ver
// escalaDoDia). Ha uma TOLERANCIA de entrada (por omissao 40 min): quem entra
// ate 40 min depois da hora esperada ainda conta como "Presente"; so depois
// disso fica "Atrasado".
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
// Janela de ruido para escolher a ENTRADA: uma picagem so conta como entrada
// se nao estiver mais de 6 horas ANTES da hora esperada do turno. Assim, a
// saida de um turno nocturno (ex.: 04:15) nao e lida como entrada do dia.
var JANELA_ENTRADA_ANTES = 6 * 60;
// Marcador de versao devolvido nas respostas da API. Permite confirmar (num
// deploy em producao) que a versao com escalas/turnos ja esta activa.
var VERSAO_ALGORITMO = "escalas-1";

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

// Converte "dias_descanso" da ficha ("0,6" = domingo+sabado) num mapa
// {0:true, 6:true} (numeracao do JS getDay: 0=domingo ... 6=sabado).
// Texto vazio, nulo ou invalido cai no padrao: sabado e domingo.
var diasDescansoDoColaborador = function (texto) {
  var dias = {};
  var partes = String(texto || "").split(",");
  for (var i = 0; i < partes.length; i++) {
    var n = parseInt(partes[i].trim(), 10);
    if (!isNaN(n) && n >= 0 && n <= 6) dias[n] = true;
  }
  if (Object.keys(dias).length === 0) { dias[0] = true; dias[6] = true; }
  return dias;
};

// Fallback de horario para colaboradores SEM escala semanal na base:
// usa o dias_descanso da ficha + horario global. Devolve {entrada, saida}
// ou null se esse dia da semana e' descanso.
var escalaFallback = function (colab, diaSemana) {
  var descanso = diasDescansoDoColaborador(colab.dias_descanso);
  if (descanso[diaSemana]) return null;
  return { entrada: HORARIO_ENTRADA, saida: HORARIO_SAIDA };
};

// Horario do colaborador para um dia da semana (0=domingo ... 6=sabado):
// se ele tem escala semanal gravada, ela e' a autoridade (dia sem linha ou sem
// horas = descanso); senao cai no fallback (dias_descanso + horario global).
var escalaDoDia = function (colab, mapaEscalas, diaSemana) {
  var linhas = mapaEscalas[colab.id];
  if (linhas && Object.keys(linhas).length > 0) {
    var linha = linhas[diaSemana];
    if (!linha || (!linha.hora_entrada && !linha.hora_saida)) return null;
    return { entrada: linha.hora_entrada, saida: linha.hora_saida };
  }
  return escalaFallback(colab, diaSemana);
};

// Carrega as escalas semanais de um conjunto de colaboradores:
// mapa colabId -> { diaSemana -> {hora_entrada, hora_saida} }
var carregarMapaEscalas = async function (colaboradores) {
  var mapa = {};
  if (!colaboradores || colaboradores.length === 0) return mapa;
  var ids = colaboradores.map(function (c) { return c.id; });
  var linhas = await EscalaSemanal.findAll({
    where: { colaborador_id: { [Op.in]: ids } },
  });
  for (var i = 0; i < linhas.length; i++) {
    var l = linhas[i];
    if (!mapa[l.colaborador_id]) mapa[l.colaborador_id] = {};
    mapa[l.colaborador_id][l.dia_semana] = {
      hora_entrada: l.hora_entrada || null,
      hora_saida: l.hora_saida || null,
    };
  }
  return mapa;
};

// O turno passa da meia-noite? (hora de entrada depois da hora de saida,
// ex.: 20:00-04:00) — nesse caso a saida pode estar no dia seguinte.
var turnoNocturno = function (escala) {
  if (!escala || !escala.entrada || !escala.saida) return false;
  var e = paraMinutos(escala.entrada);
  var s = paraMinutos(escala.saida);
  if (e === null || s === null) return false;
  return s < e;
};

// Classifica o estado:
//   - sem hora de entrada                -> Ausente
//   - dia de hoje ainda sem hora de saida -> Em_Curso (provisorio, pode mudar)
//   - entrada depois da hora esperada do turno + tolerancia -> Atrasado
//   - resto                              -> Presente
var classificarEstado = function (horaEntrada, temSaida, data, escala) {
  var minutosEntrada = paraMinutos(horaEntrada);
  if (minutosEntrada === null) return "Ausente";
  if (diaEmCurso(data, temSaida)) return "Em_Curso";
  var minutosLimite = paraMinutos(escala && escala.entrada ? escala.entrada : HORARIO_ENTRADA);
  if (minutosLimite === null) return "Presente";
  return minutosEntrada > minutosLimite + TOLERANCIA_MINUTOS ? "Atrasado" : "Presente";
};

// Observacao automatica: indica o atraso e a saida esperada (prolongamento),
// com base no horario do proprio colaborador (ou o global como fallback).
var observacaoAutomatica = function (horaEntrada, temSaida, data, escala) {
  var minutosEntrada = paraMinutos(horaEntrada);
  var minutosLimite = paraMinutos(escala && escala.entrada ? escala.entrada : HORARIO_ENTRADA);
  var minutosSaida = paraMinutos(escala && escala.saida ? escala.saida : HORARIO_SAIDA);
  if (minutosEntrada === null) return "Falta automática: sem picagem no biómetro";
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
// Inclui o texto do "Ausente" automatico ("Falta automática: sem picagem no
// biometro"): quando a picagem chega depois (atraso do aparelho/ponte) e o
// registo passa a Presente/Atrasado, a observacao tem de ser actualizada —
// senao ficava a dizer "sem picagem" num registo que ja tem picagem.
var ehObservacaoAutomatica = function (texto) {
  if (!texto) return true;
  var s = String(texto);
  return s.indexOf("automático do biómetro") !== -1 || s.indexOf("Falta automática") !== -1;
};

// Descobre a entrada e a saida de um dia a partir das picagens.
// As picagens chegam por lotes (por vezes so uma), por isso nao se pode assumir
// que a ultima do lote e' a saida: so passa a saida se estiver pelo menos
// MINUTOS_SAIDA depois da entrada.
// picagens: [{hora:"HH:MM:SS", tipo, ts:Date, dataStr:"YYYY-MM-DD"}] ordenadas
// por ts. Em turnos nocturnos a lista inclui as picagens da madrugada do dia
// seguinte (antes das 12:00): essas contam como saida, nunca como entrada.
// NOTA: o tipo do aparelho (0=entrada, 1=saida) NAO e' usado — nos ZKTeco
// testados devolve sempre 1, mesmo nas picagens de entrada da manha.
var atribuirHorarios = function (entradaActual, saidaActual, picagens, escala, dataStr) {
  var entrada = entradaActual || null;
  var saida = saidaActual || null;

  var minutosEsperada = escala && escala.entrada ? paraMinutos(escala.entrada) : paraMinutos(HORARIO_ENTRADA);

  // Entrada guardada muito fora da janela do turno (ex.: saida do turno
  // nocturno anterior gravada pelo algoritmo antigo): re-descobre.
  if (entrada && minutosEsperada !== null) {
    var mEnt0 = paraMinutos(entrada);
    if (mEnt0 !== null) {
      var dif0 = mEnt0 - minutosEsperada;
      if (dif0 < -JANELA_ENTRADA_ANTES || dif0 > 12 * 60) entrada = null;
    }
  }

  // offset da saida ja guardada (1440 se era do dia seguinte ao da entrada)
  var offsetSaida = 0;
  if (saida && entrada) {
    var mS0 = paraMinutos(saida);
    var mE0 = paraMinutos(entrada);
    if (mS0 !== null && mE0 !== null && mS0 < mE0) offsetSaida = 1440;
  }

  var lista = picagens.slice().sort(function (a, b) { return a.ts - b.ts; });

  for (var i = 0; i < lista.length; i++) {
    var p = lista[i];
    var minutos = paraMinutos(p.hora);
    if (minutos === null) continue;
    var offsetDia = (p.dataStr && dataStr && p.dataStr > dataStr) ? 1440 : 0;
    var minutosEff = minutos + offsetDia;

    if (!entrada) {
      // Entrada: ignora picagens muito antes da hora esperada (saida do turno
      // nocturno anterior). Sem escala (fallback global), aceita a primeira.
      if (minutosEsperada !== null && minutosEff < minutosEsperada - JANELA_ENTRADA_ANTES) continue;
      entrada = p.hora;
      continue;
    }
    var minutosEntrada = paraMinutos(entrada);
    if (minutosEntrada === null) continue;

    if (minutosEff < minutosEntrada) {
      // Picagem mais cedo do que a entrada actual: so reajusta a entrada para
      // tras dentro do proprio dia (a madrugada seguinte e' saida, nao entrada).
      if (!offsetDia) { entrada = p.hora; }
      continue;
    }

    var minutosSaidaEff = saida ? paraMinutos(saida) + offsetSaida : null;
    if (minutosSaidaEff !== null && minutosEff <= minutosSaidaEff) continue;

    if (minutosEff - minutosEntrada >= MINUTOS_SAIDA) {
      saida = p.hora;
      offsetSaida = offsetDia;
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
      var resultadoReclass = await reclassificarAutomaticos();
      return res.status(200).json({
        mensagem: "Nenhuma picagem nova",
        recebidas: recebidas,
        novas: 0,
        duplicadas: duplicadas,
        sem_mapeamento: 0,
        registos_criados: 0,
        registos_actualizados: 0,
        ausentes_criados: 0,
        reclassificados: resultadoReclass.actualizados,
        ausentes_removidos: resultadoReclass.removidos,
        versao_algoritmo: VERSAO_ALGORITMO,
      });
    }

    // 2) Mapear id_biometrico -> colaborador
    var colaboradores = await Colaborador.findAll({
      where: { id_biometrico: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] } },
      attributes: ["id", "nome_completo", "numero_colaborador", "id_biometrico", "estado", "data_admissao", "data_desligamento", "dias_descanso"],
    });
    var mapa = {};
    for (var j = 0; j < colaboradores.length; j++) {
      mapa[colaboradores[j].id_biometrico.toString().trim()] = colaboradores[j];
    }
    var mapaEscalas = await carregarMapaEscalas(colaboradores);

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
        return { hora: horaLocal(d), tipo: grupo.tipos[indice], ts: d, dataStr: dataLocal(d) };
      });

      var diaSemanaGrupo = new Date(grupo.data + "T00:00:00").getDay();
      var escalaGrupo = escalaDoDia(grupo.colab, mapaEscalas, diaSemanaGrupo);

      var existente = await RegistoPresenca.findOne({
        where: { colaborador_id: grupo.colab.id, data: grupo.data },
      });

      // Entrada e saida do dia, juntando as picagens novas com o que ja existe
      var horarios = atribuirHorarios(
        existente ? existente.hora_entrada : null,
        existente ? existente.hora_saida : null,
        picagensOrdenadas,
        escalaGrupo,
        grupo.data
      );
      var entrada = horarios.entrada;
      var saida = horarios.saida;

      // Sem entrada valida e sem registo: a picagem e' ruido (ex.: saida de um
      // turno nocturno que chegou de madrugada). Nao cria registo falso.
      if (!existente && !entrada) {
        await PicagemBiometrico.update({ processada: true }, { where: { id: { [Op.in]: grupo.ids } } });
        continue;
      }

      if (!existente) {
        await RegistoPresenca.create({
          colaborador_id: grupo.colab.id,
          data: grupo.data,
          hora_entrada: entrada,
          hora_saida: saida,
          horas_trabalhadas: calcularHorasTrabalhadas(entrada, saida),
          horas_extras: 0,
          estado: classificarEstado(entrada, !!saida, grupo.data, escalaGrupo),
          metodo: "Biometrico",
          observacoes: observacaoAutomatica(entrada, !!saida, grupo.data, escalaGrupo),
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
        // Sem entrada valida, nao regride um registo existente (a picagem pode
        // ser a saida de um turno nocturno, processada pela reclassificacao).
        if (!entrada) {
          await PicagemBiometrico.update({ processada: true }, { where: { id: { [Op.in]: grupo.ids } } });
          continue;
        }
        // Estado automatico: Ausente/Atrasado/Presente/Em_Curso sao recalculados pelo
        // biometro; estados manuais como Licenca/Ferias sao preservados.
        var novoEstado = existente.estado;
        if (existente.estado === "Ausente" || existente.estado === "Atrasado" || existente.estado === "Presente" || existente.estado === "Em_Curso") {
          novoEstado = classificarEstado(entrada, !!saida, grupo.data, escalaGrupo);
        }
        var novaObs = existente.observacoes;
        if (ehObservacaoAutomatica(novaObs)) {
          novaObs = observacaoAutomatica(entrada, !!saida, grupo.data, escalaGrupo);
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

    // 4) "Ausente" automatico: colaboradores mapeados, activos, dias de trabalho
    // (segundo a escala/descanso de cada um) sem nenhuma picagem e sem registo
    var ausentesCriados = await marcarAusentesAutomaticos(colaboradores, mapaEscalas);

    // 5) Reclassificar os registos do mes corrente (tolerancia / "Em curso").
    // Correge tambem registos que ficaram com estado antigo porque nao houve
    // picagens novas (ex.: registos de hoje que ainda nao tem hora de saida).
    var resultadoReclass = await reclassificarAutomaticos();

    return res.status(200).json({
      mensagem: "Picagens sincronizadas",
      recebidas: recebidas,
      novas: novas,
      duplicadas: duplicadas,
      sem_mapeamento: semMapeamento,
      registos_criados: registosCriados,
      registos_actualizados: registosActualizados,
      ausentes_criados: ausentesCriados,
      reclassificados: resultadoReclass.actualizados,
      ausentes_removidos: resultadoReclass.removidos,
      versao_algoritmo: VERSAO_ALGORITMO,
    });
  } catch (e) {
    console.log("Erro ao sincronizar picagens:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Cria o registo "Ausente" (metodo Biometrico) para TODOS os dias do mes actual
// (do dia 1 ate hoje) em que o colaborador deveria trabalhar (segundo a escala
// semanal ou o dias_descanso) e nao tem picagem nem registo de presenca.
// Ficam de fora: os dias de descanso e os feriados. Quem esta escalado para
// trabalhar ao sabado e marcado Ausente se nao picar.
// No DIA DE HOJE so marca depois de passar a hora esperada + tolerancia (para
// nao aparecer "Ausente" a quem ainda nem chegou o turno — sobretudo turnos
// nocturnos, que comecam as 20:00).
// A assiduidade so conta a partir do dia 1 do mes. Registo corrigido a mao
// pelo RH conta como existente e nunca e mexido.
var marcarAusentesAutomaticos = async function (colaboradores, mapaEscalas) {
  if (!colaboradores || colaboradores.length === 0) return 0;

  var hoje = new Date();
  var hojeStr = dataLocal(hoje);
  var agoraMinutos = hoje.getHours() * 60 + hoje.getMinutes();

  var diasMes = [];
  var dia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  while (dia <= hoje) {
    diasMes.push(dataLocal(dia));
    dia.setDate(dia.getDate() + 1);
  }
  if (diasMes.length === 0) return 0;

  var inicioMes = diasMes[0];
  var fimMes = diasMes[diasMes.length - 1];

  if (!mapaEscalas) {
    mapaEscalas = await carregarMapaEscalas(colaboradores);
  }

  // Feriados do mes: ninguem e marcado Ausente num feriado
  var feriados = await Feriado.findAll({
    attributes: ["data"],
    where: { data: { [Op.gte]: inicioMes, [Op.lte]: fimMes } },
  });
  var datasFeriado = {};
  for (var f = 0; f < feriados.length; f++) {
    datasFeriado[dataLocal(feriados[f].data)] = true;
  }

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

    for (var j = 0; j < diasMes.length; j++) {
      var dataStr = diasMes[j];
      // Nao marcar antes da admissao nem depois do desligamento
      if (admissao && dataStr < admissao) continue;
      if (desligamento && dataStr > desligamento) continue;
      // Feriado: nunca marca ausente
      if (datasFeriado[dataStr]) continue;
      // Dia de descanso do colaborador (escala semanal ou dias_descanso)
      var diaSemana = new Date(dataStr + "T00:00:00").getDay();
      var escalaDia = escalaDoDia(colab, mapaEscalas, diaSemana);
      if (!escalaDia) continue;
      // Dia de hoje: so marca depois de passar a hora do turno + tolerancia
      if (dataStr === hojeStr) {
        var minutosLimiteHoje = paraMinutos(escalaDia.entrada || HORARIO_ENTRADA) + TOLERANCIA_MINUTOS;
        if (agoraMinutos < minutosLimiteHoje) continue;
      }
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
// a tolerancia de entrada, as escalas/turnos de cada colaborador e o estado
// provisorio "Em curso" do dia de hoje. Tambem recupera as horas de saida dos
// turnos nocturnos (a picagem de saida chega de madrugada, no dia seguinte).
// Correccoes do RH (ajustado_manual, metodo Manual) e estados manuals como
// Licenca/Ferias/Fim_semana nunca sao tocados.
var reclassificarAutomaticos = async function () {
  var hoje = new Date();
  var inicioMes = dataLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  var inicioMesSql = inicioMes + "T00:00:00";

  var registos = await RegistoPresenca.findAll({
    attributes: ["id", "colaborador_id", "data", "hora_entrada", "hora_saida", "horas_trabalhadas", "estado", "observacoes", "processada"],
    where: {
      metodo: "Biometrico",
      ajustado_manual: { [Op.or]: [false, null] },
      data: { [Op.gte]: inicioMes },
    },
  });

  // Colaboradores envolvidos (para escalas e para a limpeza final)
  var idsColabs = {};
  registos.forEach(function (r) { idsColabs[r.colaborador_id] = true; });
  var listaIds = Object.keys(idsColabs);
  var colabById = {};
  var mapaEscalas = {};
  if (listaIds.length > 0) {
    var cols = await Colaborador.findAll({
      attributes: ["id", "dias_descanso"],
      where: { id: { [Op.in]: listaIds } },
    });
    for (var ci = 0; ci < cols.length; ci++) {
      colabById[cols[ci].id] = cols[ci];
    }
    mapaEscalas = await carregarMapaEscalas(cols);
  }

  // 1) Recalcular entrada/saida a partir de TODAS as picagens ja gravadas.
  // Isto recupera as horas de saida que ficaram em falta (a picagem de saida
  // chegou sozinha num lote e, antes, era descartada) e as saidas de turnos
  // nocturnos (picagem de madrugada do dia seguinte).
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
        ts: new Date(p.data_hora),
        dataStr: dataLocal(p.data_hora),
      });
    });
  }

  // 2) Aplicar entrada/saida + estado + observacao
  var actualizados = 0;
  for (var r = 0; r < registos.length; r++) {
    var registo = registos[r];
    var data = dataLocal(registo.data);

    var colabReg = colabById[registo.colaborador_id] || { dias_descanso: null };
    var diaSemanaReg = new Date(data + "T00:00:00").getDay();
    var escala = escalaDoDia(colabReg, mapaEscalas, diaSemanaReg);

    // Picagens do dia + (turnos nocturnos) madrugada do dia seguinte
    var picagensDoDia = picagensPorDia[registo.colaborador_id + "|" + data] || [];
    var listaPicagens = picagensDoDia.slice();
    if (turnoNocturno(escala)) {
      var dSeguinte = new Date(data + "T00:00:00");
      dSeguinte.setDate(dSeguinte.getDate() + 1);
      var dataSeguinte = dataLocal(dSeguinte);
      var picagensSeguinte = picagensPorDia[registo.colaborador_id + "|" + dataSeguinte] || [];
      for (var ps = 0; ps < picagensSeguinte.length; ps++) {
        if (paraMinutos(picagensSeguinte[ps].hora) !== null && paraMinutos(picagensSeguinte[ps].hora) < 12 * 60) {
          listaPicagens.push(picagensSeguinte[ps]);
        }
      }
    }

    var horarios = atribuirHorarios(
      registo.hora_entrada,
      registo.hora_saida,
      listaPicagens,
      escala,
      data
    );
    var entrada = horarios.entrada;
    var saida = horarios.saida;
    var temSaida = !!saida;

    var novoEstado = registo.estado;
    if (registo.estado === "Ausente" || registo.estado === "Atrasado" || registo.estado === "Presente" || registo.estado === "Em_Curso") {
      novoEstado = classificarEstado(entrada, temSaida, data, escala);
    }
    var novaObs = ehObservacaoAutomatica(registo.observacoes)
      ? observacaoAutomatica(entrada, temSaida, data, escala)
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

  // 3) Limpar "Ausente" automaticos que ja nao deviam existir: dias que passaram
  // a ser feriado (o RH acrescentou retroactivo) ou dia de descanso do colaborador
  // (mudou a escala/ficha). So toca os automaticos: sem hora de entrada, nunca
  // corrigidos a mao e ainda nao processados na folha.
  var removidos = 0;
  var feriadosTodos = await Feriado.findAll({ attributes: ["data"] });
  var datasFeriadoTodos = {};
  for (var ft = 0; ft < feriadosTodos.length; ft++) {
    datasFeriadoTodos[dataLocal(feriadosTodos[ft].data)] = true;
  }
  var colsTodos = await Colaborador.findAll({ attributes: ["id", "dias_descanso"] });
  var colabTodosById = {};
  for (var cdd = 0; cdd < colsTodos.length; cdd++) {
    colabTodosById[colsTodos[cdd].id] = colsTodos[cdd];
  }
  var mapaEscalasTodos = await carregarMapaEscalas(colsTodos);

  for (var r2 = 0; r2 < registos.length; r2++) {
    var reg = registos[r2];
    if (reg.estado !== "Ausente" || reg.hora_entrada || reg.processada) continue;
    var dataReg = dataLocal(reg.data);
    if (datasFeriadoTodos[dataReg]) {
      await reg.destroy();
      removidos++;
      continue;
    }
    var colabReg2 = colabTodosById[reg.colaborador_id];
    if (colabReg2) {
      var diaSemanaReg2 = new Date(dataReg + "T00:00:00").getDay();
      if (!escalaDoDia(colabReg2, mapaEscalasTodos, diaSemanaReg2)) {
        await reg.destroy();
        removidos++;
      }
    }
  }

  return { actualizados: actualizados, removidos: removidos };
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

module.exports = { sincronizar, mapeamento, picagens, reclassificarAutomaticos, escalaFallback };
