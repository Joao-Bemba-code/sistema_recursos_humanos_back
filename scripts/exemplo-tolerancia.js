// Exemplo PRATICO da regra dos 15 minutos, sem arrancar a ponte:
//   node scripts/exemplo-tolerancia.js
// Variaveis opcionais: EXEMPLO_ID_BIO, EXEMPLO_DATA, EXEMPLO_ENTRADA, EXEMPLO_SAIDA
// Por omissao: CENFFOR001, 2026-11-24, 08:20 -> 16:20 (5 min de atraso apos
// a tolerancia das 08:15, com a saida esperada prolongada para as 16:20).
require("dotenv").config({ path: __dirname + "/../.env" });

var { Op } = require("sequelize");
var { sequelize, Colaborador, RegistoPresenca, PicagemBiometrico, Notificacao } = require("../models");
var { reclassificarAutomaticos } = require("../controllers/biometroController");

var ID_BIO = process.env.EXEMPLO_ID_BIO || "CENFFOR001";
var DATA = process.env.EXEMPLO_DATA || "2026-11-24";
var ENTRADA = process.env.EXEMPLO_ENTRADA || "08:20";
var SAIDA = process.env.EXEMPLO_SAIDA || "16:20";

var main = async function () {
  try {
    var colab = await Colaborador.findOne({ where: { id_biometrico: ID_BIO } });
    if (!colab) throw new Error("Sem colaborador com id_biometrico=" + ID_BIO);

    var inicio = new Date(DATA + "T00:00:00");
    var fim = new Date(DATA + "T23:59:59.999");

    // Deixa so as picagens do exemplo nesse dia e recalcula pelo algoritmo real.
    await PicagemBiometrico.destroy({
      where: { id_biometrico: ID_BIO, data_hora: { [Op.between]: [inicio, fim] } },
    });
    await RegistoPresenca.destroy({ where: { colaborador_id: colab.id, data: DATA } });
    await PicagemBiometrico.bulkCreate([
      {
        id_biometrico: ID_BIO,
        colaborador_id: colab.id,
        data_hora: new Date(DATA + "T" + ENTRADA + ":00"),
        tipo: 0,
        raw: JSON.stringify({ id_biometrico: ID_BIO, tipo: 0, exemplo: true }),
        processada: false,
      },
      {
        id_biometrico: ID_BIO,
        colaborador_id: colab.id,
        data_hora: new Date(DATA + "T" + SAIDA + ":00"),
        tipo: 1,
        raw: JSON.stringify({ id_biometrico: ID_BIO, tipo: 1, exemplo: true }),
        processada: false,
      },
    ]);

    var resultado = await reclassificarAutomaticos(DATA);
    var registo = await RegistoPresenca.findOne({ where: { colaborador_id: colab.id, data: DATA } });

    var alertas = await Notificacao.findAll({
      where: { titulo: "Atraso registado no biómetro" },
      order: [["createdAt", "DESC"]],
      limit: 20,
      raw: true,
    });

    console.log("");
    console.log("=== Exemplo da tolerancia de 15 minutos ===");
    console.log("Colaborador: " + colab.numero_colaborador + " — " + colab.nome_completo + " (bio=" + ID_BIO + ")");
    console.log("Entrada: " + ENTRADA + " | Saida: " + SAIDA + " | Data: " + DATA);
    console.log("Estado: " + (registo ? registo.estado : "(sem registo)"));
    console.log("Observacao: " + (registo ? registo.observacoes : "(sem registo)"));
    console.log("Reclassificados na janela: " + resultado.actualizados);
    console.log("Alertas no sino (Atraso registado no biómetro): " + alertas.length);
    alertas.slice(0, 8).forEach(function (n) {
      console.log("  - " + n.mensagem);
    });
    console.log("");
  } catch (e) {
    console.error("Erro no exemplo:", e.stack || e.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

main();
