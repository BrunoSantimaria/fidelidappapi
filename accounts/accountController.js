const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Account = require("./Account.model");
const { generateQr, sendRefreshQr } = require("../utils/generateQrKeys");

const addUserToAccount = async (req, res) => {
  console.log("Adding User to account");
  try {
    let token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const ownerId = decoded.id;

    const { email } = req.body;

    const { accountId } = req.params;

    const account = await Account.findById(accountId);

    console.log("Account", account);

    if (!account) {
      return res.status(404).json({ error: "Esta cuenta no existe" });
    }

    if (account.owner.toString() !== ownerId) {
      return res.status(401).json({ error: "No eres el owner de esta cuenta" });
    }

    if (!account.userEmails.includes(email)) {
      account.userEmails.push(email);
      await account.save();
      return res.status(200).json({ message: "User invited to account", account });
    } else {
      return res.status(400).json({ error: "El usuario ya se encuentra en la cuenta" });
    }
  } catch (error) {
    console.error("Error inviting user to account:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const refreshQr = async (req, res) => {
  console.log("Refreshing QR keys");
  console.log(req.body);
  try {
    const accountId = req.body.accountId;
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    const newQr = await generateQr();
    account.accountQr = newQr;
    await account.save();
    await sendRefreshQr(account);
    res.status(200).json({ message: "QR keys refreshed" });
  } catch (error) {
    console.error("Error refreshing QR keys:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

module.exports = { addUserToAccount, refreshQr };
