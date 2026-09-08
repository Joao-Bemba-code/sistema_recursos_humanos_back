var { DataTypes } = require("sequelize");
var { sequelize } = require("../config");

var UtilizadorPerfil = sequelize.define("UtilizadorPerfil", {
  utilizador_id: {
    type: DataTypes.UUID,
    primaryKey: true,
  },
  perfil_id: {
    type: DataTypes.UUID,
    primaryKey: true,
  },
}, {
  tableName: "utilizadores_perfis",
  timestamps: true,
});

module.exports = UtilizadorPerfil;