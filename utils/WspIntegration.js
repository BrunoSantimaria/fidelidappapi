const axios = require("axios");
const twilio = require("twilio");

const accountSid = "ACa2fc17b0da0e9966d8a2160940bcc664";
const token = "02f0cd60ac53ac4e64c5615439710a7f";
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
