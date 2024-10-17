const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendMarketingEmailEditor = async ({ to, subject, template }) => {
  try {
    // Validar que la plantilla se haya proporcionado
    if (!template || typeof template !== "string") {
      throw new Error("Template is required and must be a valid string.");
    }

    // Crear el objeto de mensaje
    const msg = {
      to,
      from: "contacto@fidelidapp.cl",
      subject,
      html: template, // Aquí se usa el template que le pasas como argumento
    };

    // Enviar el correo utilizando SendGrid
    await sgMail.send(msg);
    console.log("Email sent successfully.");
  } catch (error) {
    console.error("Error sending email:", error);
    throw error; // Lanzamos el error para que lo maneje el controlador
  }
};

module.exports = { sendMarketingEmailEditor };
