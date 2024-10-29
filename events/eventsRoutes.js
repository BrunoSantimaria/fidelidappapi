const express = require("express");
const eventController = require("./eventController");

const router = express.Router();
const { verifyToken } = require("../middleware/verifyToken.js");

// Define route for sending emails
router.get("/:accountId", verifyToken, eventController.getEvents);

module.exports = router;
