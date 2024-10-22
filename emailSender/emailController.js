const { sendMarketingEmail } = require("../utils/emailSender");
const { sendMarketingEmailEditor } = require("../utils/emailSenderEditor");
const Account = require("../accounts/Account.model");

// Controller function to handle sending emails
exports.emailSender = async (req, res) => {
  try {
    // Search for the account that has req.email on its userEmails
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

    // Iterate through each customer from the list and send an email
    for (const customer of clients) {
      if (!customer.email) {
        console.error(`Invalid email for customer: ${customer.name}`);
        continue; // Salta al siguiente cliente si no tiene correo
      }

      try {
        const emailContent = template.replace("[Name]", customer.name).replace("[Detail]", customer.detail);

        const emailData = {
          to: [customer.email], // Asegúrate de que 'to' sea un array con el email
          subject: subject,
          text: emailContent,
        };

        // Send email using sendMarketingEmail utility
        console.log("Email Data:", emailData); // Verifica la estructura del objeto emailData
        await sendMarketingEmail(emailData);
      } catch (emailError) {
        console.error(`Error sending email to ${customer.email}:`, emailError);
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
    // Buscar la cuenta que tiene el correo en userEmails
    const account = await Account.findOne({ userEmails: req.email });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Extraer datos de la solicitud
    const { template, subject, clients } = req.body;

    // Validar que la lista de clientes fue proporcionada
    if (!clients || clients.length === 0) {
      return res.status(400).send("No valid clients provided.");
    }

    // Validar que la plantilla sea una cadena de texto válida
    if (typeof template !== "string") {
      return res.status(400).send("Invalid template format.");
    }

    for (const customer of clients) {
      if (!customer.email) {
        console.error(`Invalid email for customer: ${customer.name}`);
        continue;
      }

      try {
        // Reemplazar dinámicamente los valores en la plantilla
        const personalizedTemplate = template.replace("{nombreCliente}", customer.name);

        const emailData = {
          to: [customer.email],
          subject: subject,
          template: personalizedTemplate,
        };

        console.log("Email Data:", emailData);
        await sendMarketingEmailEditor(emailData);
      } catch (emailError) {
        console.error(`Error sending email to ${customer.email}:`, emailError);
      }
    }

    res.status(200).send("Emails sent successfully!");
  } catch (error) {
    console.error("Error processing the request:", error);
    res.status(500).send("Error processing the request: " + error.message);
  }
};
