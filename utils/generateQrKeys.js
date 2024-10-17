const cron = require("node-cron");
const Account = require("../accounts/Account.model"); // Adjust the path according to your structure
const { v4: uuidv4 } = require("uuid"); // Use uuid to generate unique keys
const { sendMarketingEmail } = require("../utils/emailSender"); // Adjust the import path as needed
const qr = require("qrcode");

const generateQrKeys = async () => {
  console.log("Generating QR keys for all accounts...");
  try {
    // Set the expiration time (e.g., 24 hours from now)
    const expirationTime = new Date();
    expirationTime.setHours(expirationTime.getHours() + 24);

    // Fetch all accounts from the database
    const accounts = await Account.find().populate("owner");

    // Loop through each account and generate a QR key
    for (const account of accounts) {
      if (account.activeQr === true) {
        // Generate a unique QR key
        const qrKey = uuidv4();

        // Update the account with the new QR key and expiration time
        account.dailyKey = qrKey;
        account.qrKeyExpiration = expirationTime;
        await account.save();

        // Generate a QR code with the unique key
        const qrCodeData = await qr.toBuffer(qrKey);
        const qrCodeDataBase64 = await qrCodeData.toString("base64"); // Codificar en base64

        const subject = "Tu código QR Diario";
        const header = "Comparte este QR con tus clientes!";

        const emailContent = `
           <p>Hola,</p>
           <p>Comparte el QR adjunto con tus clientes para activar sus promociones!</p>
           <p>Este código es válido sólo por hoy!</p>
           <p>Gracias por usar Fidelidapp.</p>
           <p>Cualquier duda o problema puedes contactarnos a +56996706983.</p>
       `;

        // Send the email with the QR code
        await sendMarketingEmail({
          to: account.userEmails,
          subject,
          header,
          text: emailContent,
          attachments: [
            {
              content: qrCodeDataBase64,
              filename: "promotionqrcode.png",
              type: "image/png",
              disposition: "attachment",
            },
          ],
        });

        console.log(`QR Code sent to ${account.userEmails}`);
      }
    }
  } catch (error) {
    console.error("Error generating QR keys:", error);
  }
};

// Schedule the cron job to run every day at 6: AM UTC (3 AM CHILE)
//cron.schedule('0 6 * * *', generateQrKeys);

// Schedule the cron job to run every minute for testing
// cron.schedule("* * * * *", generateQrKeys);

module.exports = { generateQrKeys };
