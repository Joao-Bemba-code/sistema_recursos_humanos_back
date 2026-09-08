var Sequelize = require('sequelize');

var sequelize = new Sequelize('srh', 'sigraf_app', 'Sgrf2026!Lcl', {
    host: '127.0.0.1',
    dialect: 'mysql',
    port: 3306,
    connectTimeout: 60000,
    logging: false
});

(async () => {
    try {
        await sequelize.authenticate();
        console.log("Ligado a BD local!");

        try {
            var [dbs] = await sequelize.query("SHOW DATABASES");
            console.log("Databases:", dbs.map(function(d){ return Object.values(d)[0]; }));
        } catch (e) { console.log("Erro SHOW DATABASES:", e.message); }

        try {
            var [grants] = await sequelize.query("SHOW GRANTS");
            grants.forEach(function(g) { console.log(Object.values(g)[0]); });
        } catch (e) { console.log("Erro SHOW GRANTS:", e.message); }

        await sequelize.close();
    } catch (e) {
        console.error("Erro:", e.message);
        try { await sequelize.close(); } catch(_) {}
    }
})();