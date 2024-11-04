const { sendMarketingEmailEditor } = require("../utils/emailSenderEditor");
const { sendMarketingEmail } = require("../utils/emailSender");
const { Account } = require("../accounts/Account.model");
const chalk = require("chalk");
const axios = require("axios");
const MAX_CONCURRENT_EMAILS = 100; // Número máximo de correos a enviar simultáneamente

async function sendEmailsInBatches(clients, template, subject, account, emailsSentLast30Days, emailLimit) {
  let emailsSentCount = 0;

  // Función para enviar un correo individual
  const sendEmail = async (client) => {
    console.log(client);

    // Validar que el cliente tiene las propiedades necesarias
    if (!client || !client.email || !client.name) {
      console.error(`Invalid client data: ${JSON.stringify(client)}`);
      return; // Saltar correos inválidos
    }

    // Verificar si al enviar este correo, se superará el límite mensual
    if (emailsSentLast30Days + emailsSentCount >= emailLimit) {
      throw new Error(`Cannot send more emails. Monthly email limit of ${emailLimit} reached.`);
    }

    try {
      // Obtener remitentes verificados de SendGrid
      const response = await axios.get("https://api.sendgrid.com/v3/verified_senders", {
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        },
      });

      const verifiedSender = response.data.results.find((sender) => sender.from_email === account.senderEmail && sender.verified);

      // Preparar el correo con el remitente verificado o un remitente de respaldo
      const fromEmail = verifiedSender ? account.senderEmail : "contacto@fidelidapp.cl";
      const personalizedTemplate = template.replace("{nombreCliente}", client.name === "Cliente" ? "" : client.name);
      const emailData = {
        to: [client.email],
        subject: subject,
        template: personalizedTemplate,
        from: fromEmail,
      };

      console.log(chalk.yellow("Sending email to:", client.email));
      await sendMarketingEmailEditor(emailData);
      emailsSentCount++;
    } catch (error) {
      console.error("Error sending email:", error);
    }
  };

  const promises = [];
  for (const client of clients) {
    if (promises.length >= MAX_CONCURRENT_EMAILS) {
      await Promise.all(promises); // Espera a que se envíen los correos en progreso
      promises.length = 0; // Limpia el arreglo de promesas
    }
    promises.push(sendEmail(client));
  }

  await Promise.all(promises); // Espera a que se completen los correos restantes

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

    await sendEmailsInBatches(clients, template, subject, account, emailsSentLast30Days, emailLimit);

    res.status(200).send("Emails sent successfully!");
    console.log(emailLimit, emailsSentLast30Days);
  } catch (error) {
    console.error("Error processing the request:", error);
    res.status(500).send("Error processing the request: " + error.message);
  }
};
