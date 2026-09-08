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

        await sequelize.query(
            "UPDATE utilizadores SET bloqueado = false, tentativas_login = 0 WHERE username = 'admin'"
        );
        console.log("Utilizador 'admin' desbloqueado com sucesso!");

        var check = await sequelize.query(
            "SELECT username, bloqueado, tentativas_login FROM utilizadores WHERE username = 'admin'"
        );
        var row = Array.isArray(check[0]) ? check[0][0] : check[0];
        console.log(`Verificacao - ${row.username} | bloqueado: ${row.bloqueado} | tentativas: ${row.tentativas_login}`);

        await sequelize.close();
    } catch (e) {
        console.error("Erro:", e.message);
        await sequelize.close();
    }
})();
