const request = require("supertest");
const app = require("../../app");
const Campaign = require("../../campaigns/Campaign.model");

describe("Campaign Integration Tests", () => {
  it("should create campaign and process webhook events", async () => {
    // 1. Crear campaña
    const campaignResponse = await request(app)
      .post("/api/campaigns")
      .send({
        name: "Integration Test Campaign",
        subject: "Test Subject",
        recipients: ["test@email.com"],
      });

    expect(campaignResponse.status).toBe(200);
    const campaignId = campaignResponse.body.campaignId;

    // 2. Simular webhook de SendGrid
    await request(app)
      .post("/api/webhooks/sendgrid")
      .send([
        {
          event: "delivered",
          customArgs: {
            campaign_id: campaignId,
          },
        },
      ]);

    // 3. Verificar métricas actualizadas
    const metricsResponse = await request(app).get(`/api/campaigns/${campaignId}/metrics`);

    expect(metricsResponse.body.metrics.delivered).toBe(1);
  });
});
