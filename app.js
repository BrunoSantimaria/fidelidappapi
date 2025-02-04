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
const { weekdayEmailsCron, weekendEmailsCron } = require("./utils/ProcessScheduledEmails");
require("./utils/promotionsCronJob");
require("./clients/segmentCronjob");

const reminderAgendaJob = require("./utils/reminderAgendaJob");
dotenv.config();

// Conexión a la base de datos

// Conexión a la base de datos
mongoose
  .connect(process.env.DB_URI)
  .then(() => {
    console.log("Conectado a MongoDB");
    weekdayEmailsCron.start();
    weekendEmailsCron.start();

    reminderAgendaJob.start();
  })
  .catch((err) => {
    console.error("Error conectando a MongoDB:", err);
  });

// Reset email counts at the beginning of each month
cron.schedule("0 4 1 * *", async () => { 
  try {
    console.log("Checking and resetting email counts...");

    const accounts = await Account.find();

    for (let account of accounts) {
      account.emailsSentCount = 0;
      account.lastEmailSentAt = null;
      account.smsSentCount = 0;
      account.lastSmsSentAt = null;
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

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = ["https://www.fidelidapp.cl", "https://fidelidapp.cl", "http://localhost:5173"];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
// Configuración CORS general
app.use((req, res, next) => {
  // Excepción para webhooks de Sendgrid
  if (req.path === "/api/webhooks/sendgrid") {
    return next();
  }
  // Aplicar CORS normal para otras rutas
  cors(corsOptions)(req, res, next);
});

// Configurar OPTIONS para todas las rutas excepto webhooks
app.options("*", (req, res, next) => {
  if (req.path === "/api/webhooks/sendgrid") {
    return next();
  }
  cors(corsOptions)(req, res, next);
});

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
const eventRoutes = require("./events/eventsRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const webhookRoutes = require("./routes/webhook.routes");
const { scheduleEmail } = require("./emailSender/emailController");
const campaignRoutes = require("./campaigns/campaignRoutes");
const landingRoutes = require("./landingpage/landingRoutes");
const smsRoutes = require("./sms/smsRoutes");
const waiterRoutes = require("./waiters/waiter.routes");

app.use("/auth/", authRoutes);
app.use("/api/promotions/", promotionRoutes);
app.use("/api/plans/", plansRoutes);
app.use("/accounts/", accountRoutes);
app.use("/api/agenda/", agendaRoutes);
app.use("/api/email/", emailRoutes);
app.use("/api/clients", clientRoutes);
app.use("/api/automation-rules", automationRulesRoutes);
app.use("/api/mercadopago", mercadoPagoRoutes);
app.use("/api/leadsemailparser", leadsemailparserRoutes);
app.use("/api/template/", templateRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/campaigns", campaignRoutes);
app.use("/api/landing", landingRoutes);
app.use("/api/sms", smsRoutes);
app.use("/api/waiters", waiterRoutes);

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
