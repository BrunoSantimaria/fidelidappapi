const { sendMarketingEmailEditor } = require("../utils/emailSenderEditor");
const { Account } = require("../accounts/Account.model");
const chalk = require("chalk");

const MAX_CONCURRENT_EMAILS = 100; // Número máximo de correos a enviar simultáneamente

async function sendEmailsInBatches(clients, template, subject, account, emailsSentLast30Days, emailLimit) {
  let emailsSentCount = 0;

  // Función para enviar correos con un límite de concurrencia
  const sendEmail = async (client) => {
    console.log(client);

    // Validar que el cliente tiene las propiedades necesarias
    if (!client || !client.email || !client.name) {
      console.error(`Invalid client data: ${JSON.stringify(client)}`);
      return; // Saltar correos inválidos
    }

    // Verificar si al enviar este correo, se superará el límite
    if (emailsSentLast30Days + emailsSentCount >= emailLimit) {
      throw new Error(`Cannot send more emails. Monthly email limit of ${emailLimit} reached.`);
    }

    // Reemplazar dinámicamente los valores en la plantilla
    const personalizedTemplate = template.replace("{nombreCliente}", client.name === "Cliente" ? "" : client.name);
    const emailData = {
      to: [client.email],
      subject: subject,
      template: personalizedTemplate,
    };

    console.log(chalk.yellow("Sending email to:", client.email));
    await sendMarketingEmailEditor(emailData);
    emailsSentCount++;
  };

  const promises = [];
  for (const client of clients) {
    if (promises.length >= MAX_CONCURRENT_EMAILS) {
      await Promise.all(promises);
      promises.length = 0;
    }
    promises.push(sendEmail(client));
  }

  await Promise.all(promises);

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

    // Validate account plan (Optional, uncomment if needed)
    // if (account.planStatus !== "pro" && account.planStatus !== "admin") {
    //   return res.status(403).json({ error: "Only Premium or Admin accounts can send emails" });
    // }

    const { template, subject, clients } = req.body;

    // Validate that the list of clients was provided
    if (!clients || clients.length === 0) {
      return res.status(400).send("No valid clients provided.");
    }

    // Iterate through each client from the list and send an email
    for (const client of clients) {
      if (!client.email) {
        console.error(`Invalid email for client: ${client.name}`);
        continue; // Salta al siguiente cliente si no tiene correo
      }

      try {
        const emailContent = template.replace("[Name]", client.name).replace("[Detail]", client.detail);

        const emailData = {
          to: [client.email], // Asegúrate de que 'to' sea un array con el email
          subject: subject,
          text: emailContent,
        };

        // Send email using sendMarketingEmail utility
        // Verifica la estructura del objeto emailData
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
