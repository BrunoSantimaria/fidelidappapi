// Routes: smsCampaignRoutes.js
const express = require("express");
const router = express.Router();
const { createCampaign, handleStatusCallback, getCampaigns } = require("./smsController");
const { verifyToken } = require("../middleware/verifyToken.js");

// Create Campaign
router.post("/campaign", verifyToken, createCampaign);

// Status Callback
router.post("/status-callback", verifyToken, handleStatusCallback);

// Get Campaigns
router.get("/campaigns", verifyToken,getCampaigns);

// Get Customer with Phone Numbher
// router.get("/getCustomers", verifyToken, getCustomersWithPhoneNumber);

module.exports = router;