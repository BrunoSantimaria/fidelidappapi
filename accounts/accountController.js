const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const Account = require("./Account.model");
const User = require("../auth/User.model");
const { generateQr, sendRefreshQr } = require("../utils/generateQrKeys");
const chalk = require("chalk");
const multer = require("multer");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const axios = require("axios");
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const { sendMarketingEmail } = require("../utils/emailSender");

// Decode Base64-encoded service account key
const base64Credentials = process.env.GOOGLE_CREDENTIALS_BASE64;

if (!base64Credentials) {
  throw new Error("GOOGLE_CREDENTIALS_BASE64 environment variable is not set");
}

const jsonCredentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
const serviceAccountKey = JSON.parse(jsonCredentials);

const storage = new Storage({
  credentials: serviceAccountKey,
});

const bucket = storage.bucket("fapp_promotion_images");

const upload = multer({
  storage: multer.memoryStorage(), // Usamos memoryStorage para obtener el buffer
});

// Añadir un usuario a la cuenta
const addUserToAccount = async (req, res) => {
  try {
    let token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const ownerId = decoded.id;

    const { email } = req.body;
    const { accountId } = req.params;

    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ error: "Esta cuenta no existe" });
    }

    if (account.owner.toString() !== ownerId) {
      return res.status(401).json({ error: "No eres el owner de esta cuenta" });
    }

    if (!account.userEmails.includes(email)) {
      account.userEmails.push(email);
      await account.save();
      return res.status(200).json({ message: "User invited to account", account });
    } else {
      return res.status(400).json({ error: "El usuario ya se encuentra en la cuenta" });
    }
  } catch (error) {
    console.error("Error inviting user to account:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Refrescar el código QR de la cuenta
const refreshQr = async (req, res) => {
  try {
    const accountId = req.body.accountId;
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    const newQr = await generateQr();
    account.accountQr = newQr;
    await account.save();
    await sendRefreshQr(account);
    res.status(200).json({ message: "QR keys refreshed" });
  } catch (error) {
    console.error("Error refreshing QR keys:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Guardar la configuración de la cuenta
const saveAccountSettings = async (req, res) => {
  console.log(chalk.green("Saving account settings"));
  try {
    const { accountId, settings } = req.body;
    const account = await Account.findById(accountId);
    if (!account) {
      console.log(chalk.red("Account not found"));
      return res.status(404).json({ error: "Account not found" });
    }
    account.settings = settings;
    await account.save();
    res.status(200).json({ message: "Account settings saved" });
  } catch (error) {
    console.error(chalk.red("Error saving account settings:", error));
    res.status(500).json({ error: "Internal server error" });
  }
};

// Subida de archivos (logo)
const fileUpload = async (req, res, next) => {
  console.log(req.body);

  upload.single("logo")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return next();
    }

    try {
      const blob = bucket.file(`${Date.now()}-${req.file.originalname}`);
      const blobStream = blob.createWriteStream({
        resumable: false,
        contentType: req.file.mimetype,
      });

      blobStream.on("error", (err) => {
        console.error(err);
        return res.status(500).send({ message: "Failed to upload to GCP" });
      });

      blobStream.on("finish", async () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        req.body.imageUrl = publicUrl; // Almacena la URL pública en req.body
        next(); // Llama al siguiente middleware
      });

      blobStream.end(req.file.buffer); // Cargar el buffer del archivo
    } catch (error) {
      console.error("Internal server error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
};
const getLandingSettings = async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    console.log("DEBUG - account.landing:", JSON.stringify(account.landing, null, 2));
    console.log(account.landing);
    // Construir landingData incluyendo todos los campos
    const landingData = {
      title: account.landing?.title || "",
      subtitle: account.landing?.subtitle || "",
      name: account.landing?.name || "",
      colorPalette: account.landing?.colorPalette || "",
      card: {
        type: account.landing?.card?.type || "",
        content: account.landing?.card?.content || [],
        title: account.landing?.card?.title || "",
        categories: account.landing?.card?.categories || [], // Aquí estaba el problema
      },
      menu: {
        categories: account.landing?.menu?.categories || [], // Check if menu.categories exists
        settings: account.landing?.menu?.settings || {}, // Check if menu.settings exists
      },
      googleBusiness: account.landing?.googleBusiness || "",
    };

    // Log de verificación
    console.log("Verificación de campos:", {
      title: landingData.title,
      subtitle: landingData.subtitle,
      name: landingData.name,
      colorPalette: landingData.colorPalette,
      cardCategories: landingData.card.categories?.length || 0, // Check if card.categories exists
      menuCategories: landingData.menu.categories?.length || 0, // Check if menu.categories exists
    });

    res.status(200).json({ landing: account.landing });
  } catch (error) {
    console.error("❌ Error fetching landing settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
// Personalizar la cuenta con redes sociales y logo
const customizeAccount = async (req, res) => {
  try {
    const { socialMedia, accountId, imageUrl } = req.body;

    let parsedSocialMedia;
    if (typeof socialMedia === "string") {
      parsedSocialMedia = JSON.parse(socialMedia);
    } else {
      parsedSocialMedia = socialMedia;
    }

    console.log(accountId, parsedSocialMedia, imageUrl);
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    account.socialMedia = account.socialMedia || {
      instagram: "",
      facebook: "",
      whatsapp: "",
      website: "",
    };

    if (parsedSocialMedia && typeof parsedSocialMedia === "object") {
      account.socialMedia.instagram = parsedSocialMedia.instagram || "";
      account.socialMedia.facebook = parsedSocialMedia.facebook || "";
      account.socialMedia.whatsapp = parsedSocialMedia.whatsapp || "";
      account.socialMedia.website = parsedSocialMedia.website || "";
    }

    // Actualiza logo si se proporciona imageUrl
    if (imageUrl) {
      account.logo = imageUrl;
    }

    await account.save(); // Guarda los cambios en la base de datos

    return res.status(200).json({
      message: "Customization updated successfully",
      imageUrl: imageUrl,
      socialMedia: account.socialMedia, // Retorna el socialMedia actualizado
    });
  } catch (error) {
    console.error("Error customizing account:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
const createSubuser = async (subuserData) => {
  try {
    const response = await axios.post("https://api.sendgrid.com/v3/subusers", subuserData, {
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error creating subuser:", error.response?.data || error.message);
    throw new Error("Failed to create subuser");
  }
};
const createVerifiedSenderForSubuser = async (clientData) => {
  try {
    const senderData = {
      from_email: clientData.from_email, // Tu correo para recibir el enlace de verificación
      from_name: clientData.from_name,
      reply_to: clientData.reply_to,
      nickname: clientData.nickname || "Nombre del negocio",
      address: clientData.address,
      city: clientData.city,
      country: clientData.country,
      postalCode: clientData.postalCode,
    };

    const response = await axios.post(
      `https://api.sendgrid.com/v3/verified_senders`,
      { ...senderData },
      {
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Verification email sent to your inbox. Complete verification to enable sender.");
    return response.data;
  } catch (error) {
    console.error("Error sending verification email to SendGrid:", error.response?.data || error.message);
    throw new Error("Error sending verification email");
  }
};
const updateAccount = async (req, res) => {
  try {
    console.log("updateAccount");
    console.log(req.body);
    const { accountId, settings } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: "Account ID is required." });
    }

    // Find the account but don't modify the landing menu structure
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // Only update the specific fields we want to change
    const updateFields = {};
    if (settings.senderEmail) updateFields.senderEmail = settings.senderEmail;
    if (settings.phone) updateFields.phone = settings.phone;
    if (settings.name) updateFields.name = settings.name;

    // Use findByIdAndUpdate to update only specific fields
    const updatedAccount = await Account.findByIdAndUpdate(accountId, { $set: updateFields }, { new: true, runValidators: false });

    if (settings.senderEmail) {
      const senderData = {
        from_email: settings.senderEmail,
        from_name: updatedAccount.name || "Nombre del negocio",
        reply_to: settings.senderEmail,
        nickname: updatedAccount.name || "Nombre del negocio",
        address: "Dirección del negocio",
        city: "Ciudad",
        state: "CL",
        zip: "123456",
        country: "Chile",
      };

      // Crear el remitente verificado para el subusuario
      await createVerifiedSenderForSubuser(senderData);
      await sendMarketingEmail({
        to: senderData.from_email,
        subject: "Sigue estos pasos para verificar tu sender email.",
        header: "Hola, hemos sido notificados para aprobar tu sender email.",
        text: `Para verificarlo, reenvíanos el correo que recibirás de SendGrid a contacto@fidelidapp.cl, así podremos activar tu cuenta. <br><br>Gracias por elegirnos.`,
      });
    }

    res.status(200).json({ message: "Account settings saved" });
  } catch (error) {
    console.error("Error saving account settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
module.exports = { getLandingSettings, addUserToAccount, refreshQr, saveAccountSettings, customizeAccount, fileUpload, updateAccount };
