const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/verifyToken.js");
const campaignController = require("./campaignController.js");

router.get("/all", campaignController.getAllCampaigns);

module.exports = router;
