const sgMail = require("@sendgrid/mail");
const client = require("@sendgrid/client");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
client.setApiKey(process.env.SENDGRID_API_KEY);

const DEFAULT_SENDER = {
  email: "contacto@fidelidapp.cl",
  name: "FidelidApp",
};

const checkVerifiedSender = async (email) => {
  try {
    const request = {
      method: "GET",
      url: "/v3/verified_senders",
    };

    const [response] = await client.request(request);
    const verifiedSenders = response.body.results;
    return verifiedSenders.some((sender) => sender.from_email === email);
  } catch (error) {
    console.error("Error verificando sender:", error);
    return false;
  }
};

const sendMarketingEmailEditor = async ({ to, subject, template, from, campaignId, account }) => {
  try {
    console.log("Preparando envío de email a:", to);
    const totalEmails = Array.isArray(to) ? to.length : 1;

    const trackingPixel = `
      <img src="${process.env.API_URL}/track/${campaignId}" 
           alt="" 
           width="1" 
           height="1" 
           style="display:none !important;" />
    `;

    let senderEmail = "contacto@fidelidapp.cl";
    if (account?.senderEmail) {
      const isVerified = await checkVerifiedSender(account.senderEmail);
      if (isVerified) {
        senderEmail = account.senderEmail;
      }
    }

    const msg = {
      to,
      from: {
        email: from || senderEmail,
        name: account?.senderName || "FidelidApp",
      },
      subject,
      html: template + trackingPixel,

      tracking_settings: {
        click_tracking: { enable: true },
        open_tracking: { enable: true },
        subscription_tracking: {
          enable: true,
          text: "Si no deseas recibir más correos, haz clic aquí para cancelar tu suscripción.",
          html: `<p style="text-align: center; font-size: 12px; color: #666;">Si no deseas recibir más correos, haz clic <a href="{{{unsubscribe}}}" style="color: #007bff; text-decoration: underline;">aquí</a> para cancelar tu suscripción.</p>`,
        },
      },

      custom_args: {
        campaign_id: campaignId,
      },

      asm: undefined,
    };

    const mainEmailResponse = await sgMail.send(msg);
    const messageId = mainEmailResponse[0].headers["x-message-id"];

    // Actualizar la campaña con el messageId de SendGrid
    if (campaignId) {
      const Campaign = require("../campaigns/Campaign.model");
      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          sendgridMessageId: messageId,
          "metrics.totalSent": totalEmails,
        },
        { new: true }
      ).populate("accountId");

      // Si es un solo email, podemos marcar como completado inmediatamente
      if (totalEmails === 1) {
        campaign.status = "completed";
        await campaign.save();
      }
    }

    return mainEmailResponse;
  } catch (error) {
    console.error("Error en sendMarketingEmailEditor:", error);
    throw error;
  }
};

const sendReportEmail = async (recipientEmail, subject, body) => {
  try {
    console.log("Preparando envío de email a:", recipientEmail);

    const trackingPixel = `
      <img src="${process.env.API_URL}/track/" 
           alt="" 
           width="1" 
           height="1" 
           style="display:none !important;" />
    `;

    const msg = {
      to: recipientEmail,
      from: "contacto@fidelidapp.cl",
      subject,
      html: body + trackingPixel,

      tracking_settings: {
        click_tracking: { enable: true },
        open_tracking: { enable: true },
        subscription_tracking: {
          enable: true,
          text: "Si no deseas recibir más correos, haz clic aquí para cancelar tu suscripción.",
          html: `<p style="text-align: center; font-size: 12px; color: #666;">Si no deseas recibir más correos, haz clic <a href="{{{unsubscribe}}}" style="color: #007bff; text-decoration: underline;">aquí</a> para cancelar tu suscripción.</p>`,
        },
      },

      asm: undefined,
    };

    const mainEmailResponse = await sgMail.send(msg);
    return mainEmailResponse;

  }

  catch (error) {
    console.error("Error en sendReportEmail:", error);
    throw error;
  }
};

module.exports = { sendMarketingEmailEditor, sendReportEmail };
