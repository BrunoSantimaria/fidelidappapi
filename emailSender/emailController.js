const { sendMarketingEmailEditor } = require("../utils/emailSenderEditor");
const { sendMarketingEmail } = require("../utils/emailSender");
const Account = require("../accounts/Account.model");
const chalk = require("chalk");
const axios = require("axios");
const MAX_CONCURRENT_EMAILS = 100; // Número máximo de correos a enviar simultáneamente
const EmailHistory = require("./EmailHistory");

async function sendEmailsInBatches(clients, template, subject, account, emailsSentLast30Days, emailLimit) {
  let emailsSentCount = 0;
  let successfulSends = 0;
  let failedSends = 0;
  const recipients = [];

  // Obtener remitentes verificados una sola vez al inicio
  const response = await axios.get("https://api.sendgrid.com/v3/verified_senders", {
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
    },
  });
  const verifiedSender = response.data.results.find((sender) => sender.from_email === account.senderEmail && sender.verified);
  const fromEmail = verifiedSender ? account.senderEmail : "contacto@fidelidapp.cl";

  // Función para enviar un correo individual
  const sendEmail = async (client) => {
    if (!client || !client.email || !client.name) {
      console.error(`Invalid client data: ${JSON.stringify(client)}`);
      recipients.push({
        email: client?.email || "unknown",
        name: client?.name || "unknown",
        status: "failed",
        error: "Invalid client data",
      });
      failedSends++;
      return;
    }

    if (emailsSentLast30Days + emailsSentCount >= emailLimit) {
      throw new Error(`Cannot send more emails. Monthly email limit of ${emailLimit} reached.`);
    }

    try {
      const replaceNombreCliente = (text) => text.replace("{nombreCliente}", client.name === "Cliente" ? "" : client.name);

      const personalizedTemplate = replaceNombreCliente(template);
      const personalizedSubject = replaceNombreCliente(subject);

      const emailData = {
        to: [client.email],
        subject: personalizedSubject,
        template: personalizedTemplate,
        from: fromEmail,
      };

      console.log(chalk.yellow("Sending email to:", client.email));
      await sendMarketingEmailEditor(emailData);
      emailsSentCount++;
      successfulSends++;
      recipients.push({
        email: client.email,
        name: client.name,
        status: "success",
      });
    } catch (error) {
      console.error("Error sending email:", error);
      failedSends++;
      recipients.push({
        email: client.email,
        name: client.name,
        status: "failed",
        error: error.message,
      });
    }
  };

  // Procesar en lotes más pequeños
  const BATCH_SIZE = 50;
  const DELAY_BETWEEN_BATCHES = 1000;

  for (let i = 0; i < clients.length; i += BATCH_SIZE) {
    const batch = clients.slice(i, i + BATCH_SIZE);
    const promises = batch.map((client) => sendEmail(client));

    await Promise.all(promises);

    if (i + BATCH_SIZE < clients.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
    }
  }

  // Guardar el historial de envío
  await EmailHistory.create({
    accountId: account._id,
    subject,
    totalEmailsSent: emailsSentCount,
    successfulSends,
    failedSends,
    recipients,
    template,
    senderEmail: fromEmail,
  });

  // Actualizar el contador de correos enviados y la fecha del último envío
  account.emailsSentCount += emailsSentCount;
  account.lastEmailSentAt = Date.now();
  await account.save();
}
exports.emailSender = async (req, res) => {
  try {
    const account = await Account.findOne({ userEmails: req.email });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const { template, subject, clients } = req.body;

    // Verifica que se haya proporcionado una lista de clientes
    if (!clients || clients.length === 0) {
      return res.status(400).send("No valid clients provided.");
    }

    // Obtén la lista de remitentes verificados desde SendGrid
    const verifiedSendersResponse = await axios.get("https://api.sendgrid.com/v3/verified_senders", {
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      },
    });
    const verifiedSenders = verifiedSendersResponse.data.results;

    // Envía el correo a cada cliente en la lista
    for (const client of clients) {
      if (!client.email) {
        console.error(`Invalid email for client: ${client.name}`);
        continue; // Salta al siguiente cliente si no tiene correo
      }

      try {
        const emailContent = template.replace("[Name]", client.name).replace("[Detail]", client.detail);

        // Verificar si el remitente está en la lista de remitentes verificados
        const verifiedSender = verifiedSenders.find((sender) => sender.from_email === account.senderEmail && sender.verified);
        const fromEmail = verifiedSender ? account.senderEmail : "contacto@fidelidapp.cl";

        const emailData = {
          to: [client.email],
          subject: subject,
          text: emailContent,
          from: fromEmail,
        };

        // Enviar el correo utilizando sendMarketingEmail
        await sendMarketingEmail(emailData);
      } catch (emailError) {
        console.error(`Error sending email to ${client.email}:`, emailError);
      }
    }

    res.status(200).send("Emails sent successfully!");
  } catch (error) {
    console.error("Error processing the request:", error);
    res.status(500).send("Error processing the request: " + error.message);
  }
};
exports.emailSenderEditor = async (req, res) => {
  try {
    const account = await Account.findOne({ userEmails: req.email });
    let emailLimit;
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    account._id.toString() == "6709341d2a9b1c008f1cf694" || "6719040fa8d262be5ee8c2d6"
      ? (emailLimit = 30000)
      : (emailLimit = account.planStatus === "pro" ? 10000 : 1000);

    const emailsSentLast30Days = await account.getEmailSentCountLast30Days();
    console.log(emailLimit, emailsSentLast30Days);
    if (emailsSentLast30Days + 0 >= emailLimit) {
      return res.status(403).json({ error: `Email limit reached for this month (${emailLimit} emails).` });
    }

    const { template, subject, clients } = req.body;

    if (!clients || clients.length === 0) {
      return res.status(400).send("No valid clients provided.");
    }

    if (typeof template !== "string") {
      return res.status(400).send("Invalid template format.");
    }
    if (!account.firstEmailMarketingCompleted) account.firstEmailMarketingCompleted = true;
    await account.save;
    await sendEmailsInBatches(clients, template, subject, account, emailsSentLast30Days, emailLimit);

    if (!account.firstEmailMarketingCompleted) {
      account.firstEmailMarketingCompleted = true;
      await account.save();
    }

    res.status(200).send("Emails sent successfully!");
    console.log(emailLimit, emailsSentLast30Days);
  } catch (error) {
    console.error("Error processing the request:", error);
    res.status(500).send("Error processing the request: " + error.message);
  }
};
