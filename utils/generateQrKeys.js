const cron = require("node-cron");
const { Account } = require("../accounts/Account.model"); // Adjust the path according to your structure
const { v4: uuidv4 } = require("uuid"); // Use uuid to generate unique keys
const { sendMarketingEmail, sendRegisterEmail } = require("../utils/emailSender"); // Adjust the import path as needed
const qr = require("qrcode");
const account = require("../accounts/Account.model");
const generateQrKeys = async () => {
  console.log("Generating QR keys for all accounts...");
  try {
    const expirationTime = new Date();
    expirationTime.setHours(expirationTime.getHours() + 24);

    // Fetch all accounts from the database
    const accounts = await Account.find().populate("owner");

    // Loop through each account and generate a QR key
    for (const account of accounts) {
      if (account.activeQr === true) {
        // Generate a unique QR key
      }

      // Schedule the cron job to run every day at 6: AM UTC (3 AM CHILE)
      //cron.schedule('0 6 * * *', generateQrKeys);

      //  cron.schedule("* * * * *", generateQrKeys);
    }
  } catch (error) {
    console.error("Error generating QR keys:", error);
  }
};
const generateQr = async () => {
  return uuidv4();
};

const sendQrCode = async (account) => {
  try {
    await sendRegisterEmail(account);
  } catch (error) {
    console.error("Error sending welcome email:", error);
  }
};

const sendRefreshQr = async (account) => {
  const qrKey = await account.accountQr;
  const qrCodeData = await qr.toBuffer(qrKey);
  const qrCodeDataBase64 = await qrCodeData.toString("base64");

  const subject = "¡Qr actualizado!";
  const header = "Has solicitado actualizar tu QR";

  const emailContent = `
<p>Hola,</p>
<p>Te adjuntamos tu nuevo QR, el cual también se encuentra disponible en la web.</p>
<p>Gracias por usar Fidelidapp.</p>
<p>Cualquier duda o problema puedes contactarnos a +56996706983.</p>
`;
  try {
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
  } catch (error) {
    console.error("Error sending QR code:", error);
  }
};
module.exports = { generateQr, sendQrCode, sendRefreshQr };
