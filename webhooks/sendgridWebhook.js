const Campaign = require("../campaigns/Campaign.model");
const Account = require("../accounts/Account.model");
const sgMail = require("@sendgrid/mail");

exports.handleWebhook = async (req, res) => {
  try {
    for (const event of req.body) {
      const fullMessageId = event.sg_message_id;
      const baseMessageId = fullMessageId.split(".")[0];

      // Buscar campaña existente por el ID de mensaje base
      const campaign = await Campaign.findOne({
        $or: [{ sendgridMessageId: baseMessageId }, { sendgridMessageIds: baseMessageId }],
      }).populate("accountId");

      // Si no se encuentra la campaña, continuar con el siguiente evento
      if (!campaign) {
        console.log(`Campaña no encontrada para el mensaje ID: ${baseMessageId}`);
        continue;
      }

      // Procesar eventos específicos
      try {
        switch (event.event.toLowerCase()) {
          case "processed":
            campaign.metrics.processed += 1;
            if (campaign.accountId) {
              campaign.accountId.emailsSentCount = (campaign.accountId.emailsSentCount || 0) + 1;
              await campaign.accountId.save();
            }
            break;
          case "deferred":
            campaign.metrics.deferred += 1;
            break;
          case "delivered":
            campaign.metrics.delivered += 1;
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

        // Calcular el total de procesados
        const totalProcessed = campaign.metrics.delivered + campaign.metrics.bounces + campaign.metrics.blocked + campaign.metrics.spam;

        // Si todos los mensajes han sido procesados, marcar la campaña como completada
        if (totalProcessed === campaign.metrics.totalSent) {
          campaign.status = "completed";
          await campaign.accountId.save(); // Guardar cuenta también si corresponde
          console.log(`Campaña ${campaign._id} completada:`, campaign.metrics);
        }

        // Guardar las métricas actualizadas
        await campaign.save();
        console.log(`Métricas actualizadas para campaña ${campaign._id}:`, campaign.metrics);
      } catch (error) {
        console.error(`Error procesando evento para campaña ${campaign._id}:`, error);
      }
    }

    // Responder con un OK si todo sale bien
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error procesando webhook:", error);
    res.status(500).send("Error procesando webhook");
  }
};
