const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const dotenv = require("dotenv");
const cookieParser = require("cookie-parser");
const multer = require("multer");
require("./utils/cronJob");
require("./utils/generateQrKeys");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
app.use(cookieParser());

// Middleware
app.use(bodyParser.json());
const allowedOrigins = ["http://localhost:5173", "https://fidelidappclient.vercel.app"];

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
// Handle preflight requests
app.options("*", cors());

// Routes
const authRoutes = require("./auth/authRoutes");
const promotionRoutes = require("./promotions/promotionsRoutes");
const accountRoutes = require("./accounts/accountRoutes");
const plansRoutes = require("./plans/plansRoutes");
const agendaRoutes = require("./agenda/agendaRoutes");
const emailRoutes = require("./emailSender/emailRoutes");
const clientRoutes = require("./clients/clientsRoutes");
app.use("/auth/", authRoutes);
app.use("/api/promotions/", promotionRoutes);
app.use("/api/plans/", plansRoutes);
app.use("/accounts/", accountRoutes);
app.use("/api/agenda/", agendaRoutes);
app.use("/api/email/", emailRoutes);
app.use("/api/clients", clientRoutes);
// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something went wrong!");
});

// Middleware para redirigir de HTTP a HTTPS
app.use((req, res, next) => {
  if (req.protocol === "http") {
    console.log("Redirecting HTTP request to HTTPS");
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// Middleware para redirigir de fidelidapp.cl a www.fidelidapp.cl
app.use((req, res, next) => {
  if (req.hostname === "fidelidapp.cl") {
    return res.redirect(301, `http://www.fidelidapp.cl${req.url}`);
  }
  next();
});

module.exports = app;
