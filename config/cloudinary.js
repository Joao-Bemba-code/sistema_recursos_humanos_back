// Garante que o .env ja foi lido antes de configurar: este ficheiro pode ser
// exigido (require) antes de config/index.js, e sem as variaveis o SDK
// recebe api_key indefinida e falha em cada upload.
var dotenv = require("dotenv");
dotenv.config({ path: __dirname + "/../.env" });

var cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

module.exports = cloudinary;
