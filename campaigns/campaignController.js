const Campaign = require("./Campaign.model.js");
const ScheduledEmail = require("../models/ScheduledEmail.js");

exports.getAllCampaigns = async (req, res) => {
  try {
    // Cambiar params por query
    const accountId = req.query.accountId;
    console.log("AccountId recibido:", accountId);

    // Obtener campañas activas
    const activeCampaigns = await Campaign.find({
      accountId,
      status: { $in: ["in_progress", "completed"] },
    }).select("name status metrics startDate template sendgridMessageIds");

    // Obtener campañas programadas
    const scheduledCampaigns = await ScheduledEmail.find({
      account: accountId,
      status: "pending",
    }).select("subject scheduledFor status createdAt template recipients");

    // Formatear la respuesta
    res.json({
      active: activeCampaigns.map((campaign) => ({
        id: campaign._id,
        name: campaign.name,
        status: campaign.status,
        metrics: campaign.metrics,
        startDate: campaign.startDate,
        template: campaign.template,
        recipientsCount: campaign.sendgridMessageIds?.length || 0,
      })),
      scheduled: scheduledCampaigns.map((scheduled) => ({
        id: scheduled._id,
        name: scheduled.subject,
        status: scheduled.status,
        scheduledFor: scheduled.scheduledFor,
        createdAt: scheduled.createdAt,
        template: scheduled.template,
        recipientsCount: scheduled.recipients?.length || 0,
      })),
    });
  } catch (error) {
    console.error("Error al obtener campañas:", error);
    res.status(500).json({ error: "Error al obtener las campañas" });
  }
};
