const Campaign = require("../campaigns/Campaign.model");
const Account = require("../accounts/Account.model");
const sgMail = require("@sendgrid/mail");

exports.handleWebhook = async (req, res) => {
  try {
    console.log("Webhook completo recibido:", {
      eventos: req.body.map((e) => ({
        evento: e.event,
        email: e.email,
        timestamp: e.timestamp,
        sg_message_id: e.sg_message_id,
        tracking_settings: e.tracking_settings,
      })),
    });

    for (const event of req.body) {
      const fullMessageId = event.sg_message_id;
      const baseMessageId = fullMessageId.split(".")[0];
      console.log("Buscando campaña con messageId:", baseMessageId);

      const campaign = await Campaign.findOne({
        $or: [{ sendgridMessageId: baseMessageId }, { sendgridMessageIds: baseMessageId }],
      }).populate("accountId");

      if (!campaign) {
        console.log("No se encontró campaña para messageId:", baseMessageId);
        continue;
      }

      console.log("Campaña encontrada:", campaign._id);

      console.log("Procesando evento:", {
        tipo: event.event,
        email: event.email,
        campaignId: campaign._id,
      });

      try {
        // Actualizar métricas según el evento
        switch (event.event.toLowerCase()) {
          case "processed":
            // No incrementar métricas
            break;
          case "delivered":
            campaign.metrics.delivered += 1;

            // Actualizar el contador de emails enviados en la cuenta
            if (campaign.accountId) {
              campaign.accountId.emailsSentCount = (campaign.accountId.emailsSentCount || 0) + 1;
              await campaign.accountId.save();

              console.log("Account emailsSentCount actualizado en webhook:", {
                accountId: campaign.accountId._id,
                previousCount: campaign.accountId.emailsSentCount - 1,
                newCount: campaign.accountId.emailsSentCount,
              });
            }

            if (campaign.metrics.delivered + campaign.metrics.bounces === campaign.metrics.totalSent) {
              campaign.status = "completed";
            }
            break;
          case "bounce":
          case "dropped":
            campaign.metrics.bounces += 1;
            if (campaign.metrics.delivered + campaign.metrics.bounces === campaign.metrics.totalSent) {
              campaign.status = "completed";
            }
            break;
          case "open":
            campaign.metrics.opens += 1;
            console.log("Evento de apertura registrado para:", event.email);
            break;
          case "click":
            campaign.metrics.clicks += 1;
            // Si hay un click pero no hay opens, incrementamos opens también
            if (campaign.metrics.opens === 0) {
              campaign.metrics.opens += 1;
              console.log("Incrementando opens debido a click para:", event.email);
            }
            break;
          case "unsubscribe":
          case "group_unsubscribe":
            campaign.metrics.unsubscribes += 1;
            break;
          case "group_resubscribe":
            // Decrementamos unsubscribes si es mayor que 0
            if (campaign.metrics.unsubscribes > 0) {
              campaign.metrics.unsubscribes -= 1;
            }
            break;
          default:
            console.log(`Evento no manejado: ${event.event}`);
        }

        await campaign.save();
        console.log(`Métricas actualizadas para campaña ${campaign._id}:`, campaign.metrics);
      } catch (error) {
        console.error(`Error procesando evento:`, error);
      }

      console.log("SendGrid Event:", {
        event: event.event,
        email: event.email,
        sg_message_id: event.sg_message_id,
      });
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error procesando webhook:", error);
    res.status(500).send("Error procesando webhook");
  }
};
