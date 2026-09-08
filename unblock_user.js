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
        console.log("Conectado a BD!");

        var results = await sequelize.query(
            "SELECT id, nome_completo, username, email, activo, bloqueado, tentativas_login FROM utilizadores WHERE LOWER(username) LIKE '%cenfor%' OR LOWER(nome_completo) LIKE '%cenfor%'"
        );

        var users = Array.isArray(results[0]) ? results[0] : results;

        if (users.length === 0) {
            console.log("Nenhum utilizador encontrado com 'cenfor' no username ou nome.");
            await sequelize.close();
            return;
        }

        console.log("Utilizadores encontrados:");
        users.forEach(u => {
            console.log(`  - ID: ${u.id} | Nome: ${u.nome_completo} | Username: ${u.username} | Activo: ${u.activo} | Bloqueado: ${u.bloqueado} | Tentativas: ${u.tentativas_login}`);
        });

        for (var user of users) {
            await sequelize.query(
                "UPDATE utilizadores SET bloqueado = false, tentativas_login = 0 WHERE id = :id",
                { replacements: { id: user.id } }
            );
            console.log(`Utilizador '${user.username}' desbloqueado com sucesso!`);
        }

        await sequelize.close();
        console.log("Concluido!");
    } catch (e) {
        console.error("Erro:", e.message);
        await sequelize.close();
    }
})();
