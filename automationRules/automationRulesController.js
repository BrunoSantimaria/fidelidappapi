const express = require("express");
const AutomationRule = require("./automationRules.model"); // Adjust the path as necessary
const Account = require("../accounts/Account.model");

// GET: Fetch all automation rules
exports.fetchAccountRules = async (req, res) => {
  try {
    const account = await Account.findOne({ userEmails: req.email });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const rules = await AutomationRule.find({ account: account._id });
    res.status(200).json(rules);
  } catch (error) {
    console.error("Error fetching automation rules:", error);
    res.status(500).json({ message: "Error fetching automation rules" });
  }
};

// POST: Create a new automation rule
exports.createRule = async (req, res) => {
  const account = await Account.findOne({ userEmails: req.email });
  const { name, condition, conditionValue, subject, message, isActive = true } = req.body;

  console.log(req.body);

  // Validate required fields
  if (!account || !name || !condition || !conditionValue || !subject || !message) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const newRule = new AutomationRule({
    account,
    name,
    condition,
    conditionValue,
    subject,
    message,
    isActive,
  });

  try {
    const savedRule = await newRule.save();
    res.status(201).json(savedRule);
  } catch (error) {
    console.error("Error creating automation rule:", error);
    res.status(500).json({ message: "Error creating automation rule" });
  }
};

// PUT: Update an existing automation rule
exports.updateRule = async (req, res) => {
  const account = await Account.findOne({ userEmails: req.email });
  if (!account) {
    return res.status(404).json({ message: "Account not found" });
  }

  try {
    // Update the rule and return the new document
    const rule = await AutomationRule.findByIdAndUpdate(
      req.params.ruleId,
      req.body,
      { new: true, runValidators: true } // Ensure we return the updated document
    );

    if (!rule) {
      return res.status(404).json({ message: "Rule not found" });
    }
    res.status(200).json(rule);
  } catch (error) {
    console.error("Error updating automation rule:", error);
    res.status(500).json({ message: "Error updating automation rule" });
  }
};

// DELETE: Delete an automation rule
exports.deleteRule = async (req, res) => {
  try {
    const deletedRule = await AutomationRule.findByIdAndDelete(req.params.ruleId);
    if (!deletedRule) {
      return res.status(404).json({ message: "Rule not found" });
    }
    res.status(204).send(); // No content to send back
  } catch (error) {
    console.error("Error deleting automation rule:", error);
    res.status(500).json({ message: "Error deleting automation rule" });
  }
};
