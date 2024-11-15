const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendMarketingEmailEditor = async ({ to, subject, template, from }) => {
  try {
    if (!template || typeof template !== "string") {
      throw new Error("Template is required and must be a valid string.");
    }

    // Agregar el enlace de desuscripción al final del template
    const templateWithUnsubscribe = `
      ${template}
      <div style="margin-top: 20px; text-align: center;">
        <p style="font-size: 12px; color: #666;">
          Si no deseas recibir más correos, puedes 
          <a href="<%asm_group_unsubscribe_raw_url%>">desuscribirte aquí</a>
        </p>
      </div>
    `;

    const msg = {
      to,
      from: from,
      subject,
      html: templateWithUnsubscribe,
      asm: {
        group_id: 32167,
      },
    };

    await sgMail.send(msg);
    console.log("Email sent successfully.");
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

module.exports = { sendMarketingEmailEditor };
