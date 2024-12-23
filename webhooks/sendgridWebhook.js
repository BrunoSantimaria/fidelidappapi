const Campaign = require("../campaigns/Campaign.model");

exports.handleWebhook = async (req, res) => {
  try {
    for (const event of req.body) {
      const fullMessageId = event.sg_message_id;
      const baseMessageId = fullMessageId.split(".")[0];

      let campaign = await Campaign.findOrCreateBySendgridId(baseMessageId, {
        name: event.campaign_name,
        subject: event.campaign_subject,
        template: event.campaign_template,
        accountId: event.accountId,
        startDate: new Date(),
      });

      switch (event.event.toLowerCase()) {
        case "processed":
          campaign.metrics.processed += 1;
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

      await campaign.save();
    }

    res.status(200).send("OK");
  } catch (error) {
    res.status(500).send("Error procesando webhook");
  }
};
