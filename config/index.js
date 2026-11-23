var dotenv = require('dotenv');
dotenv.config({path: __dirname + '/../.env'});

var Sequelize = require('sequelize');

// Nomes historicos (Name_database, Host_database, ...) e nomes padrao
// (DB_NAME, DB_HOST, ...) sao aceites para facilitar a configuracao em
// servicos de deploy como o Render.
// Aceitar tambem as formas em maiusculas usadas pelo Hostinger (HOST_DATABASE, etc.).
var Name_database = process.env.Name_database || process.env.NAME_DATABASE || process.env.DB_NAME || process.env.MYSQL_DATABASE;
var User_database = process.env.User_database || process.env.USER_DATABASE || process.env.DB_USER || process.env.MYSQL_USER;
var Pass_database = process.env.Pass_database || process.env.PASS_DATABASE || process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD;
var Host_database = process.env.Host_database || process.env.HOST_DATABASE || process.env.DB_HOST || process.env.MYSQL_HOST;
var Port_database = process.env.Port_database || process.env.PORT_DATABASE || process.env.DB_PORT || process.env.MYSQL_PORT;
var Lang_database = process.env.Lang_database || process.env.LANG_DATABASE || process.env.DB_DIALECT || process.env.MYSQL_DIALECT;
var SSL_database = process.env.SSL_database || process.env.SSL_DATABASE || process.env.DB_SSL;
var DATABASE_URL = process.env.DATABASE_URL || process.env.DB_URL;

var host = Host_database || '127.0.0.1';
// Normalizar sempre o dialecto: o Sequelize >= 4 exige um valor explicito.
// Alguns paineis de deploy injetam Lang_database vazio ou com espacos.
var dialect = String(Lang_database || '').trim().toLowerCase();
if (!dialect) dialect = 'mysql';
if (dialect === 'postgresql' || dialect === 'mariadb') {
    dialect = dialect === 'mariadb' ? 'mysql' : 'postgres';
}
var port = parseInt(Port_database) || (dialect === 'postgres' ? 5432 : 3306);

// O TiDB Cloud usa TLS obrigatorio no endpoint publico. Se o host for do
// TiDB, activa SSL mesmo que a variavel antiga SSL_database venha como false
// (por exemplo, copiada do .env local).
var sslExplicit = String(SSL_database || '').toLowerCase();
var usaSsl = sslExplicit === 'true' || sslExplicit === '1' || sslExplicit === 'yes' ||
  /tidbcloud\.com/i.test(host);

var sequelizeOptions = {
    dialect: dialect,
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
};

// So usar DATABASE_URL quando vier com protocolo valido. Alguns paineis
// injectam uma variavel DATABASE_URL sem esquema, o que faz o Sequelize
// interpretar o protocolo como dialect e falhar com "Dialect needs to be
// explicitly supplied".
var urlValida = DATABASE_URL && /^(mysql|mariadb|postgres|postgresql):\/\//i.test(String(DATABASE_URL));

if (!urlValida) {
    sequelizeOptions.host = host;
    sequelizeOptions.port = port;
}

if (usaSsl) {
    sequelizeOptions.dialectOptions = {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    };
}

var sequelize = urlValida
    ? new Sequelize(String(DATABASE_URL), Object.assign({}, sequelizeOptions, { dialect: dialect }))
    : new Sequelize(Name_database, User_database, Pass_database, sequelizeOptions);

console.log(" Configuracao BD: " + host + ":" + port + "/" + (Name_database || '(via URL)') +
    " (dialecto: " + dialect + ", SSL: " + (usaSsl ? 'sim' : 'nao') + ")");

sequelize.authenticate()
    .then(() => {
        console.log(" Conectado com sucesso ao banco!");
    })
    .catch((e) => {
        console.log(" Houve um erro ao conectar:", e.message);
    });

module.exports = {
    Sequelize,
    sequelize
};
