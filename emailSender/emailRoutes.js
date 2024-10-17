const express = require("express");
const emailController = require("./emailController");

const router = express.Router();
const { verifyToken } = require("../middleware/verifyToken.js");

// Define route for sending emails
router.post("/", verifyToken, emailController.emailSender);
router.post("/send", verifyToken, emailController.emailSenderEditor);
module.exports = router;
