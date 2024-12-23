const express = require("express");
const router = express.Router();

// Importar controladores
const { getLandingSettings, addUserToAccount, refreshQr, saveAccountSettings, fileUpload, customizeAccount, updateAccount } = require("./accountController.js");

// Middleware de autenticación
const { verifyToken } = require("../middleware/verifyToken.js");
const { mongoose } = require("mongoose");
const Account = require("../accounts/Account.model.js");
// Rutas de autenticación
router.post("/add/:accountId", verifyToken, addUserToAccount);
router.post("/refresh", verifyToken, refreshQr);
router.post("/settings", saveAccountSettings);
router.post("/settings/customize", fileUpload, customizeAccount);
router.put("/settings/account", updateAccount);
router.get("/settings/landing/:accountId", verifyToken, getLandingSettings);

// accountController.js
const updateLandingSettings = async (req, res) => {
  try {
    const { accountId, landingSettings } = req.body;
    console.log("Updating landing settings for account:", accountId, landingSettings);
    const convertedId = new mongoose.Types.ObjectId(accountId);

    // Primero encontramos la cuenta y nos aseguramos que tenga el objeto landing
    const account = await Account.findById(convertedId);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (!account.landing) {
      account.landing = {};
    }

    // Actualizamos los campos directamente
    account.landing = {
      ...account.landing, // Mantiene el resto de las propiedades que no se están actualizando específicamente
      title: landingSettings.title,
      subtitle: landingSettings.subtitle,
      name: landingSettings.name,
      colorPalette: landingSettings.colorPalette,
      googleBusiness: landingSettings.googleBusiness,
      menu: landingSettings.menu,
      card: {
        ...account.landing.card, // Mantener el resto de las propiedades de card
        title: landingSettings.buttonTitle, // Cambia el title del card
      },
    };

    // Marcamos el campo como modificado y guardamos
    account.markModified("landing");
    try {
      const savedAccount = await account.save({ validateBeforeSave: false });
      console.log("Account updated:", savedAccount.landing);
    } catch (saveError) {
      console.error("Save error:", saveError);
    }

    res.status(200);
  } catch (error) {
    console.error("Error updating landing settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
router.put("/settings/landing", verifyToken, updateLandingSettings);
module.exports = router;
