exports.getCampaignMetrics = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.campaignId);

    res.json({
      campaignName: campaign.name,
      status: campaign.status,
      metrics: campaign.metrics,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
    });
  } catch (error) {
    res.status(500).json({ error: "Error al obtener métricas" });
  }
};
