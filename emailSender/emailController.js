const { sendMarketingEmailEditor } = require("../utils/emailSenderEditor");
const { sendMarketingEmail } = require("../utils/emailSender");
const Account = require("../accounts/Account.model");
const Promotion = require("../promotions/promotions.model");
const Client = require("../promotions/client.model");
const chalk = require("chalk");
const axios = require("axios");
const EmailHistory = require("./EmailHistory");
const Campaign = require("../campaigns/Campaign.model");
const ScheduledEmail = require("../models/ScheduledEmail");
const sgMail = require("@sendgrid/mail");

async function sendEmailsInBatches(clients, template, subject, account, emailsSentLast30Days, emailLimit, campaignId) {
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

  // Crear identificador único para la campaña en SendGrid
  const customArgs = {
    campaign_id: campaignId,
  };

  // Función para enviar un correo individual
  exports.sendEmail = async (client) => {
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
        customArgs: {
          campaign_id: campaignId,
        },
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
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const { template, subject, clients } = req.body;

    // Crear campaña inicial
    const campaign = new Campaign({
      accountId: account._id,
      name: req.body.campaignName || subject,
      subject: subject,
      template: template,
      status: "in_progress",
      metrics: {
        totalSent: 0,
        delivered: 0,
        opens: 0,
        clicks: 0,
        bounces: 0,
        unsubscribes: 0,
      },
    });

    const savedCampaign = await campaign.save();

    try {
      // Enviar emails a todos los clientes
      for (const client of clients) {
        const msg = {
          to: client.email,
          from: account.senderEmail || "contacto@fidelidapp.cl",
          subject: subject.replace(/{nombreCliente}/g, client.name || ""),
          html: template.replace(/{nombreCliente}/g, client.name || ""),
          custom_args: {
            campaign_id: savedCampaign._id.toString(),
          },
          tracking_settings: {
            click_tracking: { enable: true },
            open_tracking: { enable: true },
          },
          asm: {
            group_id: 32167,
          },
        };

        const response = await sgMail.send(msg);
        const messageId = response[0].headers["x-message-id"];
        console.log("MessageID recibido:", messageId);

        // Guardar todos los messageIds en un array en la campaña
        if (!savedCampaign.sendgridMessageIds) {
          savedCampaign.sendgridMessageIds = [];
        }
        savedCampaign.sendgridMessageIds.push(messageId);

        // Mantener el primer messageId como el principal
        if (!savedCampaign.sendgridMessageId) {
          savedCampaign.sendgridMessageId = messageId;
        }

        savedCampaign.metrics.totalSent += 1;
        await savedCampaign.save();
      }

      // Actualizar estado final
      savedCampaign.status = "completed";
      await savedCampaign.save();

      // Actualizar el contador de correos enviados en la cuenta
      if (account) {
        const currentCount = account.emailsSentCount || 0;
        account.emailsSentCount = currentCount + savedCampaign.metrics.delivered;
        account.lastEmailSentAt = new Date();

        try {
          await account.save();
          console.log("Account emailsSentCount actualizado:", {
            accountId: account._id,
            previousCount: currentCount,
            newCount: account.emailsSentCount,
            addedEmails: savedCampaign.metrics.delivered,
          });
        } catch (error) {
          console.error("Error al actualizar emailsSentCount:", error);
        }
      }

      // Crear historial de envío
      await EmailHistory.create({
        accountId: account._id,
        subject,
        totalEmailsSent: clients.length,
        successfulSends: clients.length,
        failedSends: 0,
        recipients: clients.map((client) => ({
          email: client.email,
          name: client.name,
          status: "success",
        })),
        template,
        senderEmail: account.senderEmail || "contacto@fidelidapp.cl",
      });

      // Asegurarse de tener las métricas actualizadas antes de enviar el correo
      const updatedCampaign = await Campaign.findById(savedCampaign._id);

      const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png";

      const notificationEmail = {
        to: req.email,
        from: "contacto@fidelidapp.cl",
        subject: `Campaña completada - ${updatedCampaign.name}`,
        html: `
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Campaña Completada</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #f4f4f4;
              }
              .container {
                width: 100%;
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .header {
                text-align: center;
                padding: 20px;
                border-bottom: 2px solid #5b7898;
              }
              .content {
                padding: 20px;
              }
              .metrics {
                background-color: #f8f9fa;
                border-radius: 8px;
                padding: 15px;
                margin: 20px 0;
              }
              .metric-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #e9ecef;
              }
              .footer {
                text-align: center;
                padding: 20px;
                color: #6c757d;
                font-size: 12px;
              }
              .logo {
                max-width: 150px;
                margin: 20px auto;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h2 style="color: #5b7898; margin: 0;">¡Campaña Completada Exitosamente!</h2>
              </div>
              
              <div class="content">
                <h3 style="color: #5b7898;">Detalles de la Campaña</h3>
                
                <div class="metrics">
                  <div class="metric-item">
                    <strong>Nombre de la campaña:</strong>
                    <span> ${updatedCampaign.name}</span>
                  </div>
                  <div class="metric-item">
                    <strong>ID:</strong>
                    <span> ${updatedCampaign.sendgridMessageId}</span>
                  </div>
                  <div class="metric-item">
                    <strong>Emails enviados:</strong>
                    <span> ${updatedCampaign.metrics.totalSent || 0}</span>
                  </div>
               
              
             
                  <div class="metric-item">
                    <strong>Rebotes:</strong>
                    <span> ${updatedCampaign.metrics.bounces || 0}</span>
                  </div>
             
                  <div class="metric-item">
                    <strong>Fecha de finalización:</strong>
                    <span> ${new Date().toLocaleString("es-CL", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    })}</span>
                  </div>
                </div>
              </div>

              <div class="footer">
                <img src="${logoUrl}" alt="FidelidApp Logo" class="logo">
                <p>&copy; ${new Date().getFullYear()} FidelidApp. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        tracking_settings: {
          click_tracking: { enable: true },
          open_tracking: { enable: true },
          subscription_tracking: { enable: false },
        },
      };

      await new Promise((resolve) => setTimeout(resolve, 10000));

      try {
        console.log("Enviando correo de notificación a:", req.email);

        await sgMail.send(notificationEmail);

        console.log("Correo de notificación enviado exitosamente");
      } catch (notificationError) {
        console.error("Error al enviar correo de notificación:", notificationError);
        // No lanzar el error para que no afecte la respuesta de la API
      }

      console.log("Métricas enviadas en el correo:", {
        campaignId: updatedCampaign._id,
        metrics: updatedCampaign.metrics,
      });

      console.log("Campaña finalizada:", {
        _id: savedCampaign._id,
        metrics: savedCampaign.metrics,
      });

      res.status(200).json({
        success: true,
        campaignId: savedCampaign._id,
        metrics: savedCampaign.metrics,
      });
    } catch (emailError) {
      console.error("Error enviando emails:", emailError);
      savedCampaign.status = "failed";
      await savedCampaign.save();
      throw emailError;
    }
  } catch (error) {
    console.error("Error en emailSenderEditor:", error);
    res.status(500).json({
      error: error.message,
      details: error.response?.body,
    });
  }
};

exports.startCampaign = async (req, res) => {
  try {
    console.log("Datos recibidos:", req.body);
    console.log("Cuenta:", req.account);

    // Validar datos requeridos
    if (!req.body.campaignName || !req.body.subject || !req.body.template || !req.body.recipients) {
      console.error("Faltan datos requeridos");
      return res.status(400).json({
        error: "Datos incompletos",
        required: {
          campaignName: !!req.body.campaignName,
          subject: !!req.body.subject,
          template: !!req.body.template,
          recipients: !!req.body.recipients,
        },
      });
    }

    // Crear la campaña
    const campaign = await Campaign.create({
      accountId: req.account._id,
      name: req.body.campaignName,
      subject: req.body.subject,
      status: "in_progress",
      metrics: {
        totalSent: req.body.recipients.length,
      },
    });

    console.log("Campaña creada:", campaign);

    // Enviar emails
    const emailPromises = req.body.recipients.map((recipient) =>
      sendMarketingEmailEditor({
        to: recipient,
        subject: req.body.subject,
        template: req.body.template,
        from: req.body.from,
      })
    );

    await Promise.all(emailPromises);

    res.json({
      success: true,
      campaignId: campaign._id,
    });
  } catch (error) {
    console.error("Error en startCampaign:", error);
    res.status(500).json({
      error: "Error al iniciar la campaña",
      details: error.message,
    });
  }
};

exports.handleWebhookEvent = async (req, res) => {
  try {
    const event = req.body[0];
    console.log("Procesando evento:", {
      tipo: event.event,
      email: event.email,
      campaignId: event.custom_args?.campaign_id,
    });

    const campaignId = event.custom_args?.campaign_id;
    if (!campaignId) {
      console.log("No se encontró campaign_id en el evento:", event);
      return res.status(200).send("OK");
    }

    switch (event.event) {
      case "group_unsubscribe": {
        try {
          // Buscar y actualizar la campaña
          const campaign = await Campaign.findById(campaignId);

          if (campaign) {
            campaign.metrics.unsubscribes = (campaign.metrics.unsubscribes || 0) + 1;
            await campaign.save();

            console.log("Métricas actualizadas después de desuscripción:", {
              campaignId: campaign._id,
              email: event.email,
              metrics: campaign.metrics,
            });
          } else {
          }

          // Actualizar el cliente
          const account = await Account.findOne({
            "clients.email": event.email,
          });

          if (account) {
            const clientIndex = account.clients.findIndex((client) => client.email === event.email);

            if (clientIndex !== -1) {
              account.clients[clientIndex].unsubscribed = true;
              account.clients[clientIndex].unsubscribedAt = new Date();
              await account.save();

              console.log("Cliente marcado como desuscrito:", {
                email: event.email,
                accountId: account._id,
              });
            }
          }
        } catch (error) {
          console.error("Error procesando desuscripción:", error);
        }
        break;
      }

      case "delivered":
      case "open":
      case "click":
      case "bounce":
      // ... otros casos existentes ...
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error en webhook:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.scheduleEmail = async (req, res) => {
  try {
    const { subject, template, clients, scheduledDate, campaignName } = req.body;

    // Buscar la cuenta usando el email del token
    const account = await Account.findOne({ userEmails: req.email });
    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Cuenta no encontrada",
      });
    }

    // Validaciones básicas
    if (!subject || !template || !clients || !scheduledDate) {
      return res.status(400).json({
        success: false,
        message: "Faltan campos requeridos",
      });
    }

    // Validar que la fecha programada sea futura
    const scheduledFor = new Date(scheduledDate);
    if (scheduledFor <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "La fecha de programación debe ser futura",
      });
    }

    // Crear la campaña primero
    const campaign = new Campaign({
      accountId: account._id,
      name: campaignName || subject,
      subject: subject,
      template: template,
      status: "scheduled", // Nuevo estado para campañas programadas
      scheduledFor: scheduledFor,
      metrics: {
        totalSent: 0,
        delivered: 0,
        opens: 0,
        clicks: 0,
        bounces: 0,
        unsubscribes: 0,
      },
    });

    const savedCampaign = await campaign.save();

    // Crear el email programado con referencia a la campaña
    const scheduledEmail = new ScheduledEmail({
      subject,
      template,
      recipients: clients.map((client) => ({
        email: client.email,
        name: client.name,
      })),
      userId: account._id,
      scheduledFor,
      account: account._id,
      campaignId: savedCampaign._id, // Agregar referencia a la campaña
    });

    await scheduledEmail.save();

    res.status(201).json({
      success: true,
      message: "Email programado correctamente",
      scheduledEmail,
      campaign: savedCampaign,
    });
  } catch (error) {
    console.error("Error al programar email:", error);
    res.status(500).json({
      success: false,
      message: "Error al programar el email",
    });
  }
};

exports.getScheduledEmails = async (req, res) => {
  try {
    const scheduledEmails = await ScheduledEmail.find({
      userId: req.user._id,
      status: "pending",
    }).sort({ scheduledFor: 1 });

    res.json({
      success: true,
      scheduledEmails,
    });
  } catch (error) {
    console.error("Error al obtener emails programados:", error);
    res.status(500).json({
      success: false,
      message: "Error al obtener los emails programados",
    });
  }
};


exports.previewPromotionEmails = async (req, res) => {
  try {
    const { promotionId } = req.body;

    if (!promotionId) {
      return res.status(400).send("Promotion ID is required.");
    }

    const account = await Account.findOne({ userEmails: req.email });
    if (!account) {
      return res.status(404).send("Account not found.");
    }

    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(404).send("Promotion not found.");
    }

    // Obtener clientes asociados con la cuenta
    const clients = await Client.find({ accountId: account._id });

    // Filtrar clientes que no tienen la promoción
    const clientsNotInPromotion = clients.filter((client) =>
      !client.addedPromotions.some((addedPromo) => addedPromo.promotion.toString() === promotionId)
    );

    if (clientsNotInPromotion.length === 0) {
      return res.status(200).send({
        message: "All clients are already registered in this promotion.",
        totalEmailsToSend: 0,
        recipients: [],
      });
    }

    res.status(200).send({
      message: "Emails ready to be sent.",
      totalEmailsToSend: clientsNotInPromotion.length,
      recipients: clientsNotInPromotion.map((client) => ({
        name: client.name,
        email: client.email,
      })),
    });
  } catch (error) {
    console.error("Error in previewPromotionEmails:", error);
    res.status(500).send("Error processing the request: " + error.message);
  }
};
