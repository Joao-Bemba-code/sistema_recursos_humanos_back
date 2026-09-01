var dotenv = require('dotenv');
dotenv.config({path: __dirname + '/.env'});

var bcrypt = require('bcryptjs');
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
    logging: false
});

(async () => {
    try {
        await sequelize.authenticate();
        console.log("Conectado a BD!");

        var novaSenha = 'admin123';
        var salt = await bcrypt.genSalt(12);
        var hashedPassword = await bcrypt.hash(novaSenha, salt);

        await sequelize.query(
            "UPDATE utilizadores SET password = :password, must_change_password = true WHERE email = :email",
            {
                replacements: { password: hashedPassword, email: 'admin@cenffor.co.ao' }
            }
        );
        console.log("Senha do utilizador admin@cenffor.co.ao atualizada com sucesso!");

        var check = await sequelize.query(
            "SELECT username, email, must_change_password FROM utilizadores WHERE email = :email",
            { replacements: { email: 'admin@cenffor.co.ao' } }
        );
        var row = Array.isArray(check[0]) ? check[0][0] : check[0];
        console.log(`Verificacao - ${row.username} | ${row.email} | must_change_password: ${row.must_change_password}`);

        await sequelize.close();
    } catch (e) {
        console.error("Erro:", e.message);
        await sequelize.close();
    }
})();