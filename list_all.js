var dotenv = require('dotenv');
dotenv.config({path: __dirname + '/.env'});

var {Name_database, User_database, Pass_database, Host_database, Lang_database, Port_database, SSL_database} = process.env;

var Sequelize = require('sequelize');

var sslEnabled = String(SSL_database).toLowerCase() === 'true';
var sequelizeOptions = {
    host: Host_database,
    dialect: Lang_database,
    port: parseInt(Port_database) || 3306,
    connectTimeout: 60000,
    logging: false
};
if (sslEnabled) {
    sequelizeOptions.dialectOptions = { ssl: { require: true, rejectUnauthorized: false } };
}
var sequelize = new Sequelize(Name_database, User_database, Pass_database, sequelizeOptions);

(async () => {
    try {
        await sequelize.authenticate();
        console.log("Conectado a BD!\n");

        var users = await sequelize.query(
            "SELECT id, nome_completo, username, email, activo, bloqueado, tentativas_login FROM utilizadores"
        );
        var rows = Array.isArray(users[0]) ? users[0] : users;

        console.log("=== Todos os Utilizadores ===");
        rows.forEach(u => {
            console.log(`  ${u.username} | ${u.nome_completo} | activo: ${u.activo} | bloqueado: ${u.bloqueado} | tentativas: ${u.tentativas_login}`);
        });

        var orgs = await sequelize.query(
            "SELECT id, nome, nome_curto, dominio, activo FROM organizacoes"
        );
        var orgRows = Array.isArray(orgs[0]) ? orgs[0] : orgs;

        console.log("\n=== Todas as Organizacoes ===");
        orgRows.forEach(o => {
            console.log(`  ${o.nome} | curto: ${o.nome_curto} | dominio: ${o.dominio} | activo: ${o.activo}`);
        });

        await sequelize.close();
    } catch (e) {
        console.error("Erro:", e.message);
        await sequelize.close();
    }
})();
