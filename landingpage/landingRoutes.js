const express = require("express");
const router = express.Router();
const Account = require("../accounts/Account.model");
const Promotion = require("../promotions/promotions.model");
const Client = require("../promotions/client.model");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const StrToObjectId = (id) => new mongoose.Types.ObjectId(id);
router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    console.log("🚀 ~ router.get ~ slug:", slug);
    const account = await Account.findOne({ slug }).select("name card logo socialMedia landingLinks promotions");

    if (!account) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }

    if (!account.promotions || account.promotions.length === 0) {
      return res.json({ ...account.toObject(), promotions: [] });
    }

    // Obtener las promociones asociadas a la cuenta
    const promotionIds = account.promotions.map((id) => new mongoose.Types.ObjectId(id));
    const promotions = await Promotion.find({ _id: { $in: promotionIds } });
    res.json({ ...account.toObject(), promotions });
  } catch (error) {
    console.error("Error al obtener los datos:", error);
    res.status(500).json({ error: "Error al obtener los datos del landing page" });
  }
});
router.get("/:slug/fidelicard/:clientId?", async (req, res) => {
  try {
    const { slug, clientId } = req.params;
    const { email, accountId } = req.query;
    console.log("🚀 ~ router.get ~ slug, clientId:", slug, email, accountId);
    await addPromotionsToClient(email, accountId);
    // Primero, encuentra la cuenta por el slug
    const account = await Account.findOne({ slug });
    if (!account) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }

    const _id = StrToObjectId(email);
    const query = _id
      ? {
          clientId,
          addedAccounts: { $elemMatch: { accountId: StrToObjectId(account._id) } },
        }
      : {
          _id: new mongoose.Types.ObjectId(clientId),
          addedAccounts: { $elemMatch: { accountId: StrToObjectId(account._id) } },
        };

    // Encuentra el cliente
    const client = await Client.findById(_id).populate({
      path: "addedpromotions.promotion",
      model: "Promotion",
    });
    console.log("🚀 ~ client ~ client:", client);
    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // Filtrar promociones activas
    const activePromotions = account.promotions.filter((promo) => {
      const now = new Date();
      return (!promo.startDate || promo.startDate <= now) && (!promo.endDate || promo.endDate >= now) && promo.status === "active";
    });

    // Preparar datos de FideliCard
    const fideliCardData = {
      name: client.name,
      email: client.email,
      phoneNumber: client.phoneNumber,
      totalPoints: client.totalPoints,
      activities: client.activities.sort((a, b) => b.date - a.date).slice(0, 5),
      promotions: activePromotions,
      addedPromotions: client.addedpromotions,
    };

    res.json(fideliCardData);
  } catch (error) {
    console.error("Error fetching FideliCard data:", error);
    res.status(500).json({ error: "Error al obtener los datos de la FideliCard" });
  }
});

const addPromotionsToClient = async (client, accountId) => {
  // Find the account and its promotions
  const account = await Account.findById(accountId).populate("promotions");
  console.log("🚀 ~ addPromotionsToClient ~ account:", account);
  console.log(client, accountId);
  if (!account) {
    throw new Error("Cuenta no encontrada");
  }
  const clientNew = await Client.findById(StrToObjectId(client));
  // Ensure addedPromotions exists
  if (!clientNew.addedpromotions) {
    client.addedpromotions = [];
  }

  // Add new promotions while preserving existing data
  account.promotions.forEach((promotion) => {
    // Check if promotion already exists
    const existingPromotion = clientNew.addedpromotions.find((p) => p.promotion.toString() === promotion._id.toString());

    if (!existingPromotion) {
      // Add new promotion with default values
      clientNew.addedpromotions.push({
        promotion: promotion._id,
        addedDate: new Date(),
        endDate: promotion.endDate,
        actualVisits: 0,
        pointsEarned: 0,
        status: "Active",
        redeemCount: 0,
        systemType: promotion.systemType || "visits",
        visitDates: [],
      });
    }
  });

  await clientNew.save();
  return clientNew;
};

// Registration Route
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, accountId } = req.body;

    // Check if client already exists in the account
    const existingClient = await Client.findOne({
      email,
      addedAccounts: { $elemMatch: { accountId: new mongoose.Types.ObjectId(accountId) } },
    });

    if (existingClient) {
      return res.status(400).json({ error: "El cliente ya está registrado en esta cuenta" });
    }

    // Create the client
    const client = new Client({
      name,
      email,
      phoneNumber: phone,
      addedAccounts: [{ accountId: new mongoose.Types.ObjectId(accountId) }],
    });

    // Add promotions to the client
    const updatedClient = await addPromotionsToClient(client, accountId);

    // Create JWT token
    const token = jwt.sign({ clientId: updatedClient._id }, process.env.JWT_SECRET, { expiresIn: "300h" });

    return res.status(201).json({
      message: "Cliente registrado con éxito",
      token,
      clientId: updatedClient._id,
      addedAccounts: updatedClient.addedAccounts,
      addedPromotions: updatedClient.addedpromotions,
    });
  } catch (error) {
    console.error("Error al registrar cliente:", error);
    return res.status(500).json({ error: "Error al registrar cliente" });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  try {
    const { email, accountId } = req.body;

    // Find the client and ensure they're registered for the account
    const client = await Client.findOne({
      email,
      addedAccounts: { $elemMatch: { accountId: new mongoose.Types.ObjectId(accountId) } },
    });

    if (!client) {
      return res.status(404).json({
        error: "Cliente no encontrado o no registrado en esta cuenta",
        errorCode: "CLIENT_NOT_FOUND",
      });
    }

    // Add any new promotions for the account
    const updatedClient = await addPromotionsToClient(client, accountId);

    // Create JWT token
    const token = jwt.sign({ clientId: updatedClient._id }, process.env.JWT_SECRET, { expiresIn: "300h" });

    return res.status(200).json({
      message: "Login exitoso",
      token,
      clientId: updatedClient._id,
      addedAccounts: updatedClient.addedAccounts,
      addedPromotions: updatedClient.addedpromotions,
      accountId,
    });
  } catch (error) {
    console.error("Error al hacer login:", error);
    return res.status(500).json({ error: "Error al iniciar sesión" });
  }
});

// Route to get FideliCard data

// Route to add an activity (you can expand this later)
router.post("/add-activity", async (req, res) => {
  try {
    const { email, accountId, activity } = req.body;

    const client = await Client.findOne({
      email,
      addedAccounts: { $elemMatch: { accountId } },
    });

    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // Add activity
    client.activities.push({
      type: activity.type,
      description: activity.description,
      amount: activity.amount,
      promotionId: activity.promotionId,
    });

    await client.save();

    res.status(201).json({
      message: "Actividad agregada exitosamente",
      totalPoints: client.totalPoints,
    });
  } catch (error) {
    console.error("Error adding activity:", error);
    res.status(500).json({ error: "Error al agregar la actividad" });
  }
});

module.exports = router;
