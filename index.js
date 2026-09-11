var express = require("express");
var fileUpload = require("express-fileupload");
var dotenv = require("dotenv");
dotenv.config();

var cors = require("cors");
var helmet = require("helmet");
var morgan = require("morgan");
var path = require("path");
var { sanitizeBody } = require("./middlewars/sanitizer");
var errorHandler = require("./middlewars/errorHandler");
var { authenticate } = require("./protect/auth");

var authRoutes = require("./routers/auth");
var userRoutes = require("./routers/users");
var perfilRoutes = require("./routers/perfis");
var organizacaoRoutes = require("./routers/organizacoes");
var colaboradorRoutes = require("./routers/colaboradores");
var departamentoRoutes = require("./routers/departamentos");
var seccaoRoutes = require("./routers/seccoes");
var contratoRoutes = require("./routers/contratos");
var uploadRoutes = require("./routers/upload");
var feriasRoutes = require("./routers/ferias");
var assiduidadeRoutes = require("./routers/assiduidade");
var formacaoRoutes = require("./routers/formacao");
var avaliacaoRoutes = require("./routers/avaliacao");
var folhaSalarialRoutes = require("./routers/folhaSalarial");
var notificacaoRoutes = require("./routers/notificacoes");
var pedidoRoutes = require("./routers/pedidos");
var portalRoutes = require("./routers/portal");
var faltasRoutes = require("./routers/faltas");
var pdfRoutes = require("./routers/pdf");
var ocorrenciaRoutes = require("./routers/ocorrencias");

// CORREÇÃO: Importação protegida do módulo seed para evitar o crash MODULE_NOT_FOUND
var seed = null;
try {
  seed = require("./seed");
} catch (e) {
  console.log("⚠️ Aviso: O módulo de seed não foi encontrado ou falhou ao carregar.");
}

var migrations = require("./migrations");
var { sequelize, syncDatabase } = require("./models");

process.on("unhandledRejection", function (err) {
  console.log("Unhandled rejection:", err.message);
});

process.on("uncaughtException", function (err) {
  console.log("Uncaught exception:", err.message);
});

var app = express();
var port = process.env.PORT || 8000;

// Seguranca
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// File upload
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 },
  abortOnLimit: true,
  createParentPath: true,
}));

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Sanitizacao
app.use(sanitizeBody);

// Logging
app.use(morgan("dev"));

// Uploads estaticos
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { setHeaders: function(res) { res.set("Cache-Control", "no-store, no-cache, must-revalidate"); res.set("Pragma", "no-cache"); } }));

// LOG de rotas
app.use(function (req, res, next) {
  console.log(" " + req.method + " " + req.url);
  next();
});

// Rotas publicas
app.use("/auth", authRoutes);

// Rotas protegidas
app.use("/api/users", authenticate, userRoutes);
app.use("/api/perfis", authenticate, perfilRoutes);
app.use("/api/organizacoes", authenticate, organizacaoRoutes);
app.use("/api/colaboradores", authenticate, colaboradorRoutes);
app.use("/api/departamentos", authenticate, departamentoRoutes);
app.use("/api/seccoes", authenticate, seccaoRoutes);
app.use("/api/contratos", authenticate, contratoRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/ferias", authenticate, feriasRoutes);
app.use("/api/assiduidade", authenticate, assiduidadeRoutes);
app.use("/api/formacao", authenticate, formacaoRoutes);
app.use("/api/avaliacao", authenticate, avaliacaoRoutes);
app.use("/api/folha-salarial", authenticate, folhaSalarialRoutes);
app.use("/api/notificacoes", authenticate, notificacaoRoutes);
app.use("/api/pedidos", authenticate, pedidoRoutes);
app.use("/api/portal", authenticate, portalRoutes);
app.use("/api/faltas", authenticate, faltasRoutes);
app.use("/api/pdf", authenticate, pdfRoutes);
app.use("/api/ocorrencias", authenticate, ocorrenciaRoutes);

// Health check
app.get("/health", function (req, res) {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Rota de teste
app.get("/test", function (req, res) {
  res.status(200).json({ msg: "API de Recursos Humanos a funcionar!" });
});

app.get("/", function (req, res) {
  res.status(200).json({
    msg: "API Sistema de Gestão de Recursos Humanos",
    versao: "1.0.0",
    empresa: "CENFFOR",
    port: port,
  });
});

// 404
app.use(function (req, res) {
  console.log("Rota não encontrada: " + req.method + " " + req.url);
  res.status(404).json({ error: "Rota não encontrada" });
});

// Error handler
app.use(errorHandler);

// Iniciar servidor
app.listen(port, async function () {
  console.log("=================================");
  console.log(" SGHR v1.0.0 - CENFFOR");
  console.log(" Server on porta " + port);
  console.log("=================================");

  try {
    await migrations();
    await syncDatabase();
    
    // CORREÇÃO: Execução condicional e segura do seed
    if (seed && typeof seed === "function") {
      await seed();
      console.log(" Seeds executadas com sucesso!");
    } else if (seed && typeof seed.seed === "function") {
      await seed.seed();
      console.log(" Seeds executadas com sucesso!");
    } else {
      console.log(" Ficheiro de seed ignorado (não definido ou sem função válida).");
    }

  } catch (e) {
    console.log(" Erro ao iniciar:", e.message);
  }

  setInterval(function () {
    sequelize.query("SELECT 1").catch(function (err) {
      console.log("Keepalive error:", err.message);
    });
  }, 300000);
});
