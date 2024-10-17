const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Account = require("./Account.model");

// Endpoint para invitar a un usuario a una cuenta
exports.addUserToAccount = async (req, res) => {
  console.log("Adding User to account");
  try {
    // Extract the user ID from the JWT token in the request headers
    let token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const ownerId = decoded.id;

    // Extract the email from the request body
    const { email } = req.body;

    //extract account id from request
    const { accountId } = req.params;

    const account = await Account.findById(accountId);

    console.log("Account", account);

    // Validate that the account exists
    if (!account) {
      return res.status(404).json({ error: "Esta cuenta no existe" });
    }

    // Validate that the requesting user is the owner of the account
    if (account.owner.toString() !== ownerId) {
      return res.status(401).json({ error: "No eres el owner de esta cuenta" });
    }

    // Check if the email is already in the account
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
