const mongoose = require("mongoose");
const { emailSenderEditor } = require("../../emailSender/emailController");
const Campaign = require("../../campaigns/Campaign.model");
const Account = require("../../accounts/Account.model");

describe("Email Controller Tests", () => {
  let mockAccount;
  let mockReq;
  let mockRes;

  beforeEach(async () => {
    mockAccount = await Account.create({
      _id: new mongoose.Types.ObjectId(),
      userEmails: ["test@test.com"],
      planStatus: "pro",
    });

    mockReq = {
      body: {
        campaignName: "Test Campaign",
        subject: "Test Subject",
        template: "<p>Test template</p>",
        recipients: ["test@recipient.com"],
      },
      account: mockAccount,
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
  });

  test("should create campaign and send emails", async () => {
    await emailSenderEditor(mockReq, mockRes);

    const campaign = await Campaign.findOne({
      accountId: mockAccount._id,
    });

    expect(campaign).toBeTruthy();
    expect(campaign.name).toBe("Test Campaign");
    expect(mockRes.status).toHaveBeenCalledWith(200);
  });
});
