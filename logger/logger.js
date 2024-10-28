// utils/logger.js
const Log = require("./Logger.model");
const Slack = require("@slack/bolt");

const app = new Slack.App({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  token: process.env.SLACK_BOT_TOKEN,
});

const logAction = async (email, action, details, SlackChannel) => {
  const channel = SlackChannel || process.env.SLACK_CHANNEL;
  console.log("SlackChannel:", channel);

  try {
    const log = new Log({ email, action, details });
    await log.save();

    await app.client.chat.postMessage({
      channel: channel,
      text: `Nueva Acción Registrada en Fidelidapp
        Email: ${email} 
        Acción: ${action} 
        Detalle: ${details}`,
    });

    console.log("Action logged:", log);
    return log;
  } catch (error) {
    console.error("Error logging action:", error);
  }
};


module.exports = { logAction };
