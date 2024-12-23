const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const sendAgendaEmail = async ({ to, subject, header, text, attachments }) => {
  const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"; // Replace with your actual logo URL
  const formattedText = text.replace(/(?:\r\n|\r|\n)/g, "<br>");
  const html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Promoción</title>
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
              text-color: #ffffff;
              color: #ffffff;
            }
            .footer {
              text-align: center;
              padding: 20px;
              font-size: 12px;
              color: #aaaaaa;
            }

            .button.confirm {
            background-color: #5c7898;
            color: white; 

            }
            .button.cancel {
            background-color: #ffffff; /* White */
            border: 2px solid #f44336; /* Red border */
            color: black; /* Text color */ 
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="content">
            ${header ? `<h1>${header}</h1>` : ""}
              <p>${formattedText}</p>
            </div>
            <div class="footer">
            <img src="${logoUrl}" alt="FidelidApp Logo" height="100">
              <p>&copy; ${new Date().getFullYear()} FidelidApp. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `;
  try {
    const msg = {
      to,
      from: "contacto@fidelidapp.cl",
      subject,
      html,
      attachments,
    };

    await sgMail.send(msg);
    console.log("Email sent successfully.");
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};
const sendMarketingEmail = async ({ to, subject, header, text, attachments }) => {
  const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"; // Replace with your actual logo URL
  const formattedText = text.replace(/(?:\r\n|\r|\n)/g, "<br>");

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Promoción</title>
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
          ${header ? `<h1>${header}</h1>` : ""}
          <p>${formattedText}</p>
        </div>
        <div class="footer">
          <p>Powered by FidelidApp.cl</p>
          <img src="${logoUrl}" alt="FidelidApp Logo" height="50">
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const msg = {
      to,
      from: "contacto@fidelidapp.cl",
      subject,
      html,
      attachments: attachments || [],
    };

    await sgMail.send(msg);
    console.log("Email sent successfully.");
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

// Cron job function to send summary email
// const sendReportEmail = async (recipientEmail, subject, body) => {
//   try {
//     const msg = {
//       to: recipientEmail, // Replace with recipient email
//       from: "contacto@fidelidapp.cl", // Verified SendGrid sender email
//       subject: subject,
//       html: body,
//     };

//     await sgMail.send(msg);
//     console.log(`Report email sent to ${recipientEmail}`);
//   } catch (error) {
//     console.error("Error sending report email:", error.response?.body || error.message);
//   }
// };


module.exports = { sendMarketingEmail, sendAgendaEmail };
