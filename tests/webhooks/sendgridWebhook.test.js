const mongoose = require("mongoose");
const { handleWebhook } = require("../../webhooks/sendgridWebhook");
const Campaign = require("../../campaigns/Campaign.model");

describe("SendGrid Webhook Tests", () => {
  let mockCampaign;
  let mockReq;
  let mockRes;

  beforeEach(async () => {
    // Crear campaña de prueba con ObjectId válido
    mockCampaign = await Campaign.create({
      accountId: new mongoose.Types.ObjectId(),
      name: "Test Campaign",
      status: "in_progress",
      metrics: {
        delivered: 0,
        opens: 0,
        clicks: 0,
        bounces: 0,
      },
    });

    mockReq = {
      body: [
        {
          event: "delivered",
          customArgs: {
            campaign_id: mockCampaign._id.toString(),
          },
        },
      ],
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };
  });

  it("should process delivered event", async () => {
    await handleWebhook(mockReq, mockRes);

    const updatedCampaign = await Campaign.findById(mockCampaign._id);
    expect(updatedCampaign.metrics.delivered).toBe(1);
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });
});
