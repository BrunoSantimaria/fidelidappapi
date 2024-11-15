const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const cron = require("node-cron");
const Account = require("./accounts/Account.model");

require("./utils/cronJob");
require("./automationRules/automationsCronJob");
require("./utils/emailSender");
require("./utils/generateQrKeys");
require("./utils/leadsemailparser");



dotenv.config();

// Conexión a la base de datos
mongoose
  .connect(process.env.DB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Conectado a MongoDB");
  })
  .catch((err) => {
    console.error("Error conectando a MongoDB:", err);
  });

// Resto de tu código...
cron.schedule("0 0 */30 * *", async () => {
  try {
    console.log("Checking and resetting email counts...");

    const accounts = await Account.find();

    for (let account of accounts) {
      account.emailsSentCount = 0;
      account.lastEmailSentAt = null;
      await account.save();
    }

    console.log("Email counts reset successfully for all accounts.");
  } catch (error) {
    console.error("Error resetting email counts:", error);
  }
});

// Initialize Express app
const app = express();
require("./utils/updatePlans");
app.use(cookieParser());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ limit: "10mb", extended: true }));
app.use(express.urlencoded({ extended: true }));

// Middleware
const allowedOrigins = ["http://localhost:5173", "https://www.fidelidapp.cl", "https://fidelidappclient.vercel.app"];
const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
};

app.use(cors(corsOptions));
app.options("*", cors());

// Routes
const authRoutes = require("./auth/authRoutes");
const promotionRoutes = require("./promotions/promotionsRoutes");
const accountRoutes = require("./accounts/accountRoutes");
const plansRoutes = require("./plans/plansRoutes");
const agendaRoutes = require("./agenda/agendaRoutes");
const emailRoutes = require("./emailSender/emailRoutes");
const clientRoutes = require("./clients/clientsRoutes");
const automationRulesRoutes = require("./automationRules/automationRulesRoutes");
const mercadoPagoRoutes = require("./mercadopago/mercadopagoRoutes");
const leadsemailparserRoutes = require("./utils/leadsemailparser");
const templateRoutes = require("./template/templateRoutes");
app.use("/auth/", authRoutes);
app.use("/api/promotions/", promotionRoutes);
app.use("/api/plans/", plansRoutes);
app.use("/accounts/", accountRoutes);
app.use("/api/agenda/", agendaRoutes);
app.use("/api/email/", emailRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/automationRules", automationRulesRoutes);
app.use("/api/mercadopago", mercadoPagoRoutes);
app.use("/api/leadsemailparser", leadsemailparserRoutes);
app.use("/api/template/", templateRoutes);
// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});

// Middleware para redirigir de fidelidapp.cl a www.fidelidapp.cl
app.use((req, res, next) => {
  if (req.hostname === "fidelidapp.cl") {
    return res.redirect(301, `http://www.fidelidapp.cl${req.url}`);
  }
  next();
});

module.exports = app;
