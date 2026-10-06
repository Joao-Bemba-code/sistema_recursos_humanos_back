var { Op } = require("sequelize");
var { Feriado, RegistoPresenca } = require("../models");

// Lista os feriados (filtro opcional ?ano=2026), ordenados por data.
// Mostra os feriados globais (organizacao_id nulo, os pre-carregados) e os da
// organizacao do utilizador.
var list = async function (req, res) {
  try {
    var where = {};
    if (req.organizacao_id) {
      where.organizacao_id = { [Op.or]: [req.organizacao_id, null] };
    }
    if (req.query.ano) {
      var ano = String(req.query.ano).slice(0, 4);
      where.data = { [Op.gte]: ano + "-01-01", [Op.lte]: ano + "-12-31" };
    }

    var feriados = await Feriado.findAll({
      where: where,
      order: [["data", "ASC"]],
    });

    return res.status(200).json({ dados: feriados });
  } catch (e) {
    console.log("Erro ao listar feriados:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

// Cria um feriado, ou um intervalo de feriados se vier "data_fim" (ex.: ponte
// ou prolongamento — data 05-12 e data_fim 07-12 cria os 3 dias). Alem de
// guardar, apaga os "Ausente" automaticos (metodo Biometrico, sem hora de
// entrada, nao corrigidos a mao) desses dias — para o feriado nao deixar
// faltas falsas na folha. Registo manual do RH nunca e tocado.
var create = async function (req, res) {
  try {
    var data = String(req.body.data || "").slice(0, 10);
    var dataFim = req.body.data_fim ? String(req.body.data_fim).slice(0, 10) : "";
    var descricao = req.body.descricao ? String(req.body.descricao).slice(0, 200) : null;

    var validarData = function (texto) {
      return /^\d{4}-\d{2}-\d{2}$/.test(texto) && !isNaN(new Date(texto + "T00:00:00").getTime());
    };
    if (!validarData(data)) {
      return res.status(400).json({ error: "Data inválida. Use o formato AAAA-MM-DD" });
    }
    if (dataFim && !validarData(dataFim)) {
      return res.status(400).json({ error: "Data final inválida. Use o formato AAAA-MM-DD" });
    }
    if (dataFim && dataFim < data) {
      return res.status(400).json({ error: "A data final tem de ser igual ou depois da data inicial" });
    }

    // Monta a lista de dias do intervalo (so a data, ou data ate data_fim)
    var datas = [];
    var cursor = new Date(data + "T00:00:00");
    var fim = dataFim ? new Date(dataFim + "T00:00:00") : new Date(data + "T00:00:00");
    while (cursor <= fim) {
      var dia =
        cursor.getFullYear() +
        "-" + String(cursor.getMonth() + 1).padStart(2, "0") +
        "-" + String(cursor.getDate()).padStart(2, "0");
      datas.push(dia);
      if (datas.length > 31) {
        return res.status(400).json({ error: "Intervalo demasiado grande (máximo 31 dias)" });
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Nao cria nada se alguma das datas ja existir (evita intervalos a meio)
    var jaExistem = await Feriado.findAll({ where: { data: { [Op.in]: datas } }, attributes: ["data"] });
    if (jaExistem.length > 0) {
      var datasExistentes = jaExistem.map(function (f) { return f.data; }).join(", ");
      return res.status(409).json({ error: "Já existe feriado em: " + datasExistentes });
    }

    var criados = [];
    for (var i = 0; i < datas.length; i++) {
      criados.push(await Feriado.create({
        data: datas[i],
        descricao: descricao,
        organizacao_id: req.organizacao_id || null,
      }));
    }

    // Limpar "Ausente" automaticos dos dias do feriado
    var removidos = 0;
    try {
      removidos = await RegistoPresenca.destroy({
        where: {
          data: { [Op.in]: datas },
          estado: "Ausente",
          metodo: "Biometrico",
          hora_entrada: null,
          ajustado_manual: { [Op.or]: [false, null] },
        },
      });
    } catch (limparErr) {
      console.log("Aviso ao limpar ausentes do feriado:", limparErr.message);
    }

    return res.status(201).json({
      mensagem: datas.length > 1 ? "Feriados criados com sucesso (" + datas.length + " dias)" : "Feriado criado com sucesso",
      dados: criados,
      criados: datas.length,
      ausentes_removidos: removidos,
    });
  } catch (e) {
    console.log("Erro ao criar feriado:", e.message);
    if (e.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Já existe um feriado nessa data" });
    }
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

var remove = async function (req, res) {
  try {
    var feriado = await Feriado.findByPk(req.params.id);
    if (!feriado) {
      return res.status(404).json({ error: "Feriado não encontrado" });
    }

    await feriado.destroy();

    return res.status(200).json({ mensagem: "Feriado eliminado com sucesso" });
  } catch (e) {
    console.log("Erro ao eliminar feriado:", e.message);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
};

module.exports = { list, create, remove };
