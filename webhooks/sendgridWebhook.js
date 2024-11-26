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
      })),
    });

    for (const event of req.body) {
      const fullMessageId = event.sg_message_id;
      const baseMessageId = fullMessageId.split(".")[0];

      const campaign = await Campaign.findOne({
        $or: [{ sendgridMessageId: baseMessageId }, { sendgridMessageIds: baseMessageId }],
      }).populate("accountId");

      if (!campaign) {
        console.log("No se encontró campaña para messageId:", baseMessageId);
        continue;
      }

      try {
        switch (event.event.toLowerCase()) {
          case "processed":
            campaign.metrics.processed += 1;
            break;
          case "deferred":
            campaign.metrics.deferred += 1;
            break;
          case "delivered":
            campaign.metrics.delivered += 1;
            if (campaign.accountId) {
              campaign.accountId.emailsSentCount = (campaign.accountId.emailsSentCount || 0) + 1;
              await campaign.accountId.save();
            }
            break;
          case "bounce":
          case "dropped":
            campaign.metrics.bounces += 1;
            break;
          case "blocked":
            campaign.metrics.blocked += 1;
            break;
          case "spam_report":
            campaign.metrics.spam += 1;
            break;
          case "open":
            campaign.metrics.opens += 1;
            break;
          case "click":
            campaign.metrics.clicks += 1;
            if (campaign.metrics.opens === 0) {
              campaign.metrics.opens += 1;
            }
            break;
          case "unsubscribe":
          case "group_unsubscribe":
            campaign.metrics.unsubscribes += 1;
            break;
          case "group_resubscribe":
            if (campaign.metrics.unsubscribes > 0) {
              campaign.metrics.unsubscribes -= 1;
            }
            break;
          default:
            console.log(`Evento no manejado: ${event.event}`);
        }

        // Verificar si todos los correos han sido procesados
        const totalProcessed = campaign.metrics.delivered + campaign.metrics.bounces + campaign.metrics.blocked + campaign.metrics.spam;

        if (totalProcessed === campaign.metrics.totalSent) {
          campaign.status = "completed";
          console.log(`Campaña ${campaign._id} completada:`, campaign.metrics);
        }

        await campaign.save();
        console.log(`Métricas actualizadas para campaña ${campaign._id}:`, campaign.metrics);
      } catch (error) {
        console.error(`Error procesando evento:`, error);
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error procesando webhook:", error);
    res.status(500).send("Error procesando webhook");
  }
};
