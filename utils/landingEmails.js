const sgMail = require("@sendgrid/mail");
const client = require("@sendgrid/client");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
client.setApiKey(process.env.SENDGRID_API_KEY);
const sendRegisterEmail = async (clientEmail, account) => {
  try {
    const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png";
    const msg = {
      to: clientEmail,
      from: "contacto@fidelidapp.cl",
      subject: `Te has registrado en ${account.name}`,
      html: `
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FidelidApp - Bienvenido</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #f4f4f4;
              }
              .container {
                width: 100%;
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .header {
                text-align: center;
                padding-bottom: 20px;
              }
              .header img {
                max-width: 150px;
              }
              .content {
                padding: 20px;
                text-align: center;
              }
              .content h1 {
                color: #333333;
              }
              .content p {
                color: #666666;
                line-height: 1.6;
              }
              .button {
                display: inline-block;
                padding: 10px 20px;
                color: #ffffff;
                background-color: #5c7898;
                border-radius: 5px;
                text-decoration: none;
                margin-top: 20px;
              }
              .footer {
                text-align: center;
                padding: 20px;
                font-size: 12px;
                color: #aaaaaa;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="content">
                <h1>¡Bienvenido a ${account.name}!</h1>
                <p>¡Gracias por registrarte! 🎉 Ahora eres parte de nuestra comunidad de fidelización. 🙌</p>
                <p>Recuerda que al registrarte podrás disfrutar de promociones exclusivas, acumular puntos y mucho más. 🌟</p>
                <p>Para empezar, visita las promociones disponibles de nuestro negocio.</p>
                <p><strong>¡Haz clic en el botón de abajo para ver nuestras promociones!</strong></p>
                <a href="${process.env.BASE_URL}/landing/${account.slug}" class="button">Ver Promociones</a>
              </div>
              <div class="footer">
                <img src="${logoUrl}" alt="FidelidApp Logo" height="100">
                <p>&copy; ${new Date().getFullYear()} FidelidApp. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
          </html>
        `,
    };

    await sgMail.send(msg);
    console.log("Register email sent successfully");
  } catch (error) {
    console.error("Error sending register email:", error);
  }
};

const sendRedemptionEmail = async (clientEmail, promotionTitle, account) => {
  try {
    const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"; // Replace with your actual logo URL
    const msg = {
      to: clientEmail,
      from: "contacto@fidelidapp.cl",
      subject: `¡Has canjeado la promoción: ${promotionTitle}!`,
      html: `
          <!DOCTYPE html>
          <html lang="es">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>FidelidApp - Canje Exitoso</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                margin: 0;
                padding: 0;
                background-color: #f4f4f4;
              }
              .container {
                width: 100%;
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 20px;
                border-radius: 10px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .header {
                text-align: center;
                padding-bottom: 20px;
              }
              .header img {
                max-width: 150px;
              }
              .content {
                padding: 20px;
                text-align: center;
              }
              .content h1 {
                color: #333333;
              }
              .content p {
                color: #666666;
                line-height: 1.6;
              }
              .button {
                display: inline-block;
                padding: 10px 20px;
                color: #ffffff;
                background-color: #5c7898;
                border-radius: 5px;
                text-decoration: none;
                margin-top: 20px;
              }
              .footer {
                text-align: center;
                padding: 20px;
                font-size: 12px;
                color: #aaaaaa;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="content">
                <h1>¡Felicidades! Has canjeado la promoción "${promotionTitle}"</h1>
                <p>🎉 ¡Enhorabuena! 🎉 Has canjeado con éxito tu promoción de ${account.name}. 💚</p>
                <p>Recuerda que siempre puedes volver para más promociones y acumular más beneficios. 🌟</p>
                <p>Para ver las promociones actuales, haz clic en el botón a continuación.</p>
                <a href="${process.env.BASE_URL}/promotions" class="button">Ver Promociones</a>
              </div>
              <div class="footer">
                <img src="${logoUrl}" alt="FidelidApp Logo" height="100">
                <p>&copy; ${new Date().getFullYear()} FidelidApp. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
          </html>
        `,
    };

    await sgMail.send(msg);
    console.log("Redemption email sent successfully");
  } catch (error) {
    console.error("Error sending redemption email:", error);
  }
};

module.exports = { sendRegisterEmail, sendRedemptionEmail };
