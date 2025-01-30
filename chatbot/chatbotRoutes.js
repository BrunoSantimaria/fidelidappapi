const express = require("express");
const router = express.Router();

const { generateResponse } = require("./chatbotController.js");

router.post("/", generateResponse);

module.exports = router;