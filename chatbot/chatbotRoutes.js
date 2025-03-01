const express = require("express");
const router = express.Router();

const { generateResponse, initChat } = require("./chatbotController.js");

router.post("/", generateResponse);
router.post("/init", initChat);

module.exports = router;