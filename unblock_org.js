var { Organizacao } = require("./models");
var sequelize = require("./config").sequelize;

async function unblockOrg() {
  try {
    await sequelize.authenticate();
    console.log("Conexão com o banco de dados estabelecida");

    // Buscar organização CENFOR pelo NIF
    var org = await Organizacao.findOne({ where: { nif: "5417279310" } });

    if (!org) {
      console.log("Organização com NIF 5417279310 não encontrada");
      // Tentar por nome também
      org = await Organizacao.findOne({ where: { nome: "Centro de Formação Profissional CENFFOR" } });
      if (!org) {
        console.log("Organização 'Centro de Formação Profissional CENFFOR' também não encontrada");
        return;
      }
    }

    console.log("Organização encontrada:");
    console.log("  ID:", org.id);
    console.log("  Nome:", org.nome);
    console.log("  NIF:", org.nif);
    console.log("  Ativo atual:", org.activo);

    // Ativar a organização
    await org.update({ activo: true });

    console.log("\nOrganização ativada com sucesso!");
    console.log("  Novo status ativo:", org.activo);
  } catch (e) {
    console.log("Erro:", e.message);
  } finally {
    await sequelize.close();
  }
}

unblockOrg();