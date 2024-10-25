// utils/logger.js
const Log = require("./Logger.model");
const Slack = require("@slack/bolt");

const app = new Slack.App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

exports.contact = async (req, res) => {
  try {
    const { name, email, message, phone, organization } = req.body;

    // Formatear detalles
    const details = `
      Nombre: ${name}
      Email: ${email}
      Organización: ${organization}
      Teléfono: ${phone}
      Mensaje: ${message}
    `;

    const contact = await log.logAction(email, "contact", details);
    res.status(201).json({ message: "Mensaje enviado con éxito" });
  } catch (error) {
    console.error("Error al enviar el mensaje:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

module.exports = { logAction };
