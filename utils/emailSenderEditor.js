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
      html:
        template +
        trackingPixel +
        `
        <div style="margin-top: 20px; text-align: center;">
          <p style="font-size: 12px; color: #666; margin: 0;">
            <a href="${process.env.API_URL}/view/${campaignId}" style="color: #666; text-decoration: underline;">Ver en navegador</a>
            <br><br>
            <a href="{{{unsubscribe}}}" style="color: #666; text-decoration: underline;">Cancelar suscripción</a> | 
            <a href="{{{asm_preferences_raw_url}}}" style="color: #666; text-decoration: underline;">Administrar preferencias de correo</a>
          </p>
        </div>`,
      tracking_settings: {
        click_tracking: { enable: true },
        open_tracking: { enable: true },
        subscription_tracking: {
          enable: true,
          substitution_tag: "{{{unsubscribe}}}",
          text: "Cancelar suscripción",
          html: "<p style='text-align: center;'>Cancelar suscripción</p>",
          landing: "Preferencias de correo",
          replace: "Cancelar suscripción",
        },
      },
      custom_args: {
        campaign_id: campaignId,
      },
      asm: {
        group_id: 32167,
        groups_to_display: [32167],
      },
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

module.exports = { sendMarketingEmailEditor };
