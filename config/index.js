var dotenv = require('dotenv');
dotenv.config({path: __dirname + '/../.env'});

var {Name_database, User_database, Pass_database, Host_database, Lang_database} = process.env;

var Sequelize = require('sequelize');

var sequelize = new Sequelize(Name_database, User_database, Pass_database, {
    host: Host_database,
    dialect: Lang_database,
    port: 4076,
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },
    connectTimeout: 60000,
    pool: {
        max: 5,
        min: 0,
        acquire: 60000,
        idle: 60000
    },
    retry: {
        match: [
            /ETIMEDOUT/,
            /ECONNRESET/,
            /ECONNREFUSED/,
            /ENOTFOUND/,
            /SequelizeConnectionError/,
        ],
        max: 3
    },
    logging: false
});

sequelize.authenticate()
    .then(() => {
        console.log(" Conectado com sucesso ao banco!");
    })
    .catch((e) => {
        console.log(" Houve um erro ao conectar:", e.message);
        console.log("Detalhes:", e);
    });

module.exports = {
    Sequelize,
    sequelize
};