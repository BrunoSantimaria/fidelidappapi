// Controller: smsCampaignController.js
const SmsCampaign = require("./smsCampaign.model");
const Sms = require("./sms.model");
const Client = require("../promotions/client.model");
const Account = require("../accounts/Account.model");
const twilio = require("twilio");
const Plan = require("../plans/Plans.model");

const accountSid = 'ACa2fc17b0da0e9966d8a2160940bcc664' //process.env.TWILIO_ACCOUNT_SID;
const authToken = '02f0cd60ac53ac4e64c5615439710a7f' // process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = '+17856308718' //process.env.TWILIO_PHONE_NUMBER;
const client = twilio(accountSid, authToken);

// Create a new SMS campaign
const createCampaign = async (req, res) => {
    const { name, message } = req.body;
    console.log("Creando Campaña:", name, message);

    //User req.email to look for accountId
    const account = await Account.findOne({ userEmails: req.email });
    if (!account) {
        return res.status(404).json({ success: false, error: "Account not found" });
    }
    accountId = account._id;

    //Search plan
    const plan = await Plan.findOne({ planStatus: account.planStatus });
    if (!plan) {
        return res.status(404).json({ success: false, error: "Plan not found" });
    }

    //Check status usage compared to plan
    if (plan.SmsLimit <= account.smsSentCount) {
        return res.status(400).json({ success: false, error: "SMS usage limit exceeded" });
    }

    if (!name || !message) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // Find all clients associated with the given accountId and having a phone number
    const clients = await Client.find({
        addedAccounts: { $elemMatch: { accountId: account._id } },
        phoneNumber: { $exists: true, $ne: '' }, // Ensure phoneNumber exists and is not empty
    }).select("name phoneNumber");

    if (clients.length === 0) {
        return res.status(404).json({
            success: false,
            message: "No clients found with a phone number for this account.",
        });
    }

    try {
        const campaign = new SmsCampaign({
            accountId,
            name,
            message,
            twilioMessageIds: [],
            phoneNumbers,
        });
        await campaign.save();

        clients.forEach(async (client) => {
            try {
                // Replace {clientName} in the message with the actual client name
                const personalizedMessage = message.replace("{clientName}", client.name);

                const twilioResponse = await client.messages.create({
                    body: personalizedMessage,
                    from: twilioPhoneNumber,
                    to: client.phoneNumber,
                    statusCallback: `https://api.fidelidapp.cl/api/sms/status-callback`,
                });
                
                console.log(`SMS sent to ${client.phoneNumber}:`, twilioResponse);
                campaign.twilioMessageIds.push(twilioResponse.sid);
                campaign.metrics.sent += 1;

                const smsRecord = new Sms({
                    AccountSid: twilioResponse.accountSid,
                    From: twilioResponse.from,
                    MessageSid: twilioResponse.sid,
                    MessageStatus: twilioResponse.status,
                    SmsSid: twilioResponse.sid,
                    SmsStatus: twilioResponse.status,
                });
                await smsRecord.save();
            } catch (error) {
                console.error(`Failed to send SMS to ${number}:`, error);
            }
        }

        );

        // Update campaign status
        campaign.status = "Completed";
        await campaign.save();

        res.status(201).json({ success: true, data: campaign });
    } catch (error) {
        console.error("Error creating campaign:", error);
        campaign.status = "Failed";
        await campaign.save();
        res.status(500).json({ success: false, error: "Failed to create campaign" });
    }
};

// Handle Status Callback
const handleStatusCallback = async (req, res) => {
    const { MessageSid, MessageStatus } = req.body;

    try {
        const smsRecord = await Sms.findOne({ MessageSid });
        if (smsRecord) {
            smsRecord.MessageStatus = MessageStatus;
            smsRecord.SmsStatus = MessageStatus;
            await smsRecord.save();

            const campaign = await SmsCampaign.findOne({ twilioMessageIds: MessageSid });
            if (!campaign) {
                console.error(`Campaign not found for MessageSid: ${MessageSid}`);
                return res.status(404).send("Campaign not found");
            }

            // Update metrics based on the status
            switch (MessageStatus) {
                case "delivered":
                    campaign.metrics.delivered += 1;
                    break;
                case "undelivered":
                    campaign.metrics.undelivered += 1;
                    break;
                case "failed":
                    campaign.metrics.failed += 1;
                    break;
                case "queued":
                    campaign.metrics.queued += 1;
                    break;
                case "sent":
                    campaign.metrics.sent += 1;
                    break;
                default:
                    console.warn(`Unhandled MessageStatus: ${MessageStatus}`);
            }
            await campaign.save();

        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Error handling status callback:", error);
        res.status(500).json({ success: false, error: "Failed to handle status callback" });
    }
};

// Get Campaigns
const getCampaigns = async (req, res) => {
    //User req.email to look for accountId
    const account = await Account.findOne({ userEmails: req.email });
    if (!account) {
        return res.status(404).json({ success: false, error: "Account not found" });
    }
    accountId = account._id;

    //Search plan
    const plan = await Plan.findOne({ planStatus: account.planStatus });
    if (!plan) {
        return res.status(404).json({ success: false, error: "Plan not found" });
    }

    try {
        // Find and count all clients associated with the given accountId and having a phone number
        const totalContactsWithPhoneNumber = await Client.countDocuments({
            addedAccounts: { $elemMatch: { accountId: account._id } },
            phoneNumber: { $exists: true, $ne: '' }, // Ensure phoneNumber exists and is not empty
        });
        const campaigns = await SmsCampaign.find().sort({ startDate: -1 });
        res.status(200).json({ success: true, data: campaigns, SmsLimit: plan.SmsLimit, SmsSentCount: account.smsSentCount, totalContactsWithPhoneNumber: totalContactsWithPhoneNumber });
    } catch (error) {
        console.error("Error fetching campaigns:", error);
        res.status(500).json({ success: false, error: "Failed to fetch campaigns" });
    }
};

// Get all clients for a specific account with a phone number
// const getCustomersWithPhoneNumber = async (req, res) => {
//     console.log("getCustomersWithPhoneNumber");
//     //Find account id by req.email
//     const account = await Account.findOne({ userEmails: req.email });
//     if (!account) {
//         return res.status(404).json({ message: "Account not found" });
//     }

//     try {
//         // Find all clients associated with the given accountId and having a phone number
//         const clients = await Client.find({
//             addedAccounts: { $elemMatch: { accountId: account._id } },
//             phoneNumber: { $ne: "" }, // Ensure phoneNumber is not empty
//         }).select("name email phoneNumber"); // Select only the desired fields

//         if (clients.length === 0) {
//             return res.status(404).json({
//                 success: false,
//                 message: "No clients found with a phone number for this account.",
//             });
//         }

//         res.status(200).json({
//             success: true,
//             data: clients,
//         });
//     } catch (error) {
//         console.error("Error fetching clients with phone numbers:", error);
//         res.status(500).json({
//             success: false,
//             error: "Failed to fetch clients with phone numbers.",
//         });
//     }
// };

module.exports = { createCampaign, handleStatusCallback, getCampaigns };