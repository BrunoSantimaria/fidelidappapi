const express = require("express");
const router = express.Router();
const templateController = require("./templateController");

router.post("/create", templateController.createTemplate);
router.get("/:userId", templateController.getTemplates);

module.exports = router;
