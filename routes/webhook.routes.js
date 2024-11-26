const express = require("express");
const router = express.Router();
const { handleWebhook } = require("../webhooks/sendgridWebhook");

router.post("/sendgrid", handleWebhook);

module.exports = router;
