const axios = require("axios");
const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_ACCOUNT_SID;
const client = new twilio(accountSid, token);

const sendWSPMessage = async (message) => {
  client.messages
    .create({
      body: message,
      from: "whatsapp:+14155238886", // Twilio Sandbox WhatsApp number
      to: "whatsapp:+56920115198", // Your recipient's WhatsApp number
    })
    .then((message) => console.log(message.sid))
    .catch((err) => console.error(err));
};

module.exports = { sendWSPMessage };
