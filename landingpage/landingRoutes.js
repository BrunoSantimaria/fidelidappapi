const express = require("express");
const router = express.Router();
const Account = require("../accounts/Account.model");
const Promotion = require("../promotions/promotions.model");
const Client = require("../promotions/client.model");
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const Schedule = require("../agenda/agenda.model");
const jwt = require("jsonwebtoken");
const { logAction } = require("../logger/logger");
const { sendRegisterEmail, sendRedemptionEmail } = require("../utils/landingEmails");
const StrToObjectId = (id) => new mongoose.Types.ObjectId(id);
const getChileanDateTime = () => {
  return moment().tz("America/Santiago").toDate();
};
const Agenda = require("../agenda/agenda.model");

router.get("/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

    // Primero encontramos la cuenta sin populate
    const accountRaw = await Account.findOne({ slug }).select("name card logo socialMedia googleBusiness landing landingLinks promotions");
    if (!accountRaw) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }

    // Buscamos todas las promociones activas
    const allPromotions = await Promotion.find({
      _id: { $in: accountRaw.promotions },
      status: "active",
    });

    // Buscamos la agenda activa para esta cuenta
    const activeAgenda = await Agenda.findOne({
      accountId: accountRaw._id,
      $or: [
        {
          type: "recurring",
          "recurringConfig.validUntil": { $gte: new Date() },
          "recurringConfig.validFrom": { $lte: new Date() },
        },
        {
          type: "special",
          "specialDates.date": { $gte: new Date() },
        },
      ],
    });

    // Hacemos la búsqueda con populate para las promociones
    const account = await Account.findOne({ slug })
      .select("name card logo socialMedia googleBusiness landing landingLinks promotions")
      .populate({
        path: "promotions",
        match: {
          status: "active",
        },
      });

    const accountData = account.toObject();
    accountData.promotions = accountData.promotions || [];

    // Si hay una agenda activa, la incluimos en el landing
    if (activeAgenda) {
      accountData.landing = {
        ...accountData.landing,
        agenda: {
          _id: activeAgenda._id,
          name: activeAgenda.name,
          description: activeAgenda.description,
          type: activeAgenda.type,
          recurringConfig: activeAgenda.recurringConfig,
          specialDates: activeAgenda.specialDates,
          duration: activeAgenda.duration,
          slots: activeAgenda.slots,
          uniqueLink: activeAgenda.uniqueLink,
        },
      };
    }

    res.json(accountData);
  } catch (error) {
    console.error("Error al obtener los datos:", error);
    res.status(404).json({ error: "Error al obtener los datos del landing page" });
  }
});

router.get("/:slug/fidelicard/:clientId?", async (req, res) => {
  try {
    const { slug, clientId } = req.params;
    const { email, accountId } = req.query;

    // Log inicial con los parámetros de entrada
    console.log("🔍 Entrada -> slug:", slug, "clientId:", clientId, "email:", email, "accountId:", accountId);

    // Intentar agregar promociones al cliente
    if (email && accountId) {
      const client = await Client.findById(StrToObjectId(email));
      await addPromotionsToClient(client, null, slug);
    } else {
      console.log("⚠️ addPromotionsToClient no ejecutado porque falta email o accountId");
    }

    const account = await Account.findOne({ slug });
    if (!account) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }

    // Obtener IDs de promociones asociadas a la cuenta
    const accountPromotionIds = account.promotions.map((promoId) => StrToObjectId(promoId));

    // Preparar query para buscar cliente
    const _id = email ? StrToObjectId(email) : null;
    const query = _id
      ? {
          clientId,
          addedAccounts: { $elemMatch: { accountId: StrToObjectId(account._id) } },
        }
      : {
          _id: new mongoose.Types.ObjectId(clientId),
          addedAccounts: { $elemMatch: { accountId: StrToObjectId(account._id) } },
        };

    // Buscar cliente
    console.log("🔍 Buscando cliente con ID:", _id || clientId);
    const client = await Client.findById(_id).populate({
      path: "addedpromotions.promotion",
      model: "Promotion",
      match: {
        _id: { $in: accountPromotionIds }, // Filtrar solo promociones asociadas
      },
    });

    if (!client) {
      console.log("❌ Cliente no encontrado para ID:", _id || clientId);
      return res.status(404).json({ error: "Cliente no encontrado" });
    }
    console.log("✔️ Cliente encontrado -> ID:", client._id);

    // Filtrar promociones no nulas
    console.log("🔍 Filtrando promociones no nulas en client.addedpromotions...");
    const addedPromotionsBefore = client.addedpromotions.length;
    client.addedpromotions = client.addedpromotions.filter((promo) => promo.promotion !== null);
    const addedPromotionsAfter = client.addedpromotions.length;
    console.log(`✔️ Promociones filtradas -> Antes: ${addedPromotionsBefore}, Después: ${addedPromotionsAfter}`);

    // Calcular puntos ganados
    console.log("🔍 Calculando puntos ganados...");

    // Filtrar promociones activas de la cuenta
    console.log("🔍 Filtrando promociones activas de la cuenta...");
    const now = getChileanDateTime();
    const activePromotions = account.promotions.filter((promo) => {
      return (!promo.startDate || promo.startDate <= now) && (!promo.endDate || promo.endDate >= now) && promo.status === "active";
    });
    const activePromotionsForOwner = activePromotions.filter((promo) => promo.userId.toString() === account.owner.toString());

    const earnedPoints = client.addedpromotions
      .filter(
        (promo) => promo.systemType === "points" // Solo promociones de puntos
      )
      .reduce((total, promo) => {
        // Asegurarse de que `pointsEarned` esté definido, si no, asignar 0
        const points = promo.pointsEarned || 0;
        return total + points; // Sumar los puntos ganados
      }, 0);

    console.log("✔️ Puntos ganados -> Total:", earnedPoints);

    // Preparar datos para la FideliCard
    console.log("🔍 Preparando datos para la FideliCard...");
    const activitiesFiltered = client.activities
      .filter((activity) => activity.accountId.toString() === account._id.toString())
      .sort((a, b) => b.date - a.date)
      .slice(0, 10);
    console.log("✔️ Actividades recientes -> Total:", activitiesFiltered.length);

    const fideliCardData = {
      name: client.name,
      email: client.email,
      phoneNumber: client.phoneNumber,
      totalPoints: earnedPoints,
      activities: activitiesFiltered,
      promotions: activePromotions,
      addedPromotions: client.addedpromotions.filter((promo) => {
        if (!promo.promotion) return false;

        const isPromotionActive =
          (!promo.promotion.startDate || promo.promotion.startDate <= now) &&
          (!promo.promotion.endDate || promo.promotion.endDate >= now) &&
          promo.promotion.status === "active";

        const isRecurrent = promo.promotion.promotionRecurrent === "True";

        // Verificar el estado específico del cliente
        const isValidClientStatus = promo.status === "Active" || (promo.status === "Redeemed" && isRecurrent);

        return isPromotionActive && isValidClientStatus;
      }),
    };
    console.log("✔️ Datos de FideliCard preparados ->", fideliCardData);

    // Enviar respuesta
    res.json(fideliCardData);
  } catch (error) {
    console.error("❌ Error al obtener los datos de la FideliCard:", error);
    res.status(500).json({ error: "Error al obtener los datos de la FideliCard" });
  }
});

const addPromotionsToClient = async (client, accountId, slug) => {
  let account;

  // Buscar la cuenta según accountId o slug
  if (accountId) {
    account = await Account.findById(accountId).populate("promotions");
  } else if (slug) {
    account = await Account.findOne({ slug: slug }).populate("promotions");
  }

  // Validar si la cuenta fue encontrada
  if (!account) {
    throw new Error("Cuenta no encontrada");
  }

  const { email } = client;

  if (!email) {
    throw new Error("El cliente no tiene un email válido.");
  }

  // Buscar cliente por email
  const clientNew = await Client.findOne({ email });
  console.log("🚀 ~ addPromotionsToClient ~ clientNew encontrado:", clientNew);

  if (!clientNew) {
    throw new Error(`Cliente con email ${email} no encontrado.`);
  }

  // Asegurarse de que addedpromotions exista
  if (!clientNew.addedpromotions) {
    clientNew.addedpromotions = [];
  }

  // Agregar promociones nuevas
  account.promotions.forEach((promotion) => {
    const existingPromotion = clientNew.addedpromotions.find((p) => p.promotion.toString() === promotion._id.toString());

    if (!existingPromotion) {
      clientNew.addedpromotions.push({
        promotion: promotion._id,
        addedDate: getChileanDateTime(),
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

  // Guardar cliente actualizado
  await clientNew.save();
  console.log("✅ Cliente actualizado exitosamente con promociones:", clientNew.addedpromotions);

  return clientNew;
};

// Registration Route
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, accountId } = req.body;

    console.log("🚀 ~ router.post ~ accountId:", accountId);
    console.log("🚀 ~ router.post ~ email:", email);

    // Formatear el accountId como ObjectId
    const formattedAccountId = new mongoose.Types.ObjectId(accountId);

    // Verificar si el cliente ya está registrado en la cuenta específica
    const existingClientRegistered = await Client.findOne({
      email: email.toLowerCase(),
      addedAccounts: { $elemMatch: { accountId: formattedAccountId } },
    });

    if (existingClientRegistered) {
      return res.status(400).json({ error: "El cliente ya está registrado en esta cuenta" });
    }

    // Verificar si el cliente existe, pero no está registrado en esta cuenta
    const existingClient = await Client.findOne({ email: email.toLowerCase() });

    if (existingClient) {
      // Agregar la nueva cuenta al array addedAccounts
      existingClient.addedAccounts.push({ accountId: formattedAccountId });

      // Guardar los cambios en el cliente
      const updatedClient = await existingClient.save();

      // Agregar promociones relacionadas con la nueva cuenta
      await addPromotionsToClient(updatedClient, accountId, null);

      // Añadir el cliente al array de `clients` de la cuenta
      await Account.findByIdAndUpdate(accountId, {
        $addToSet: { clients: { id: updatedClient._id, name: updatedClient.name, email: updatedClient.email } },
      });

      return res.status(200).json({
        message: "El cliente ha sido actualizado con la nueva cuenta",
        clientId: updatedClient._id,
        addedAccounts: updatedClient.addedAccounts,
      });
    }

    // Crear un nuevo cliente si no existe
    const client = new Client({
      name: formatName(name),
      email: email.toLowerCase(),
      phoneNumber: phone,
      addedAccounts: [{ accountId: formattedAccountId }],
    });

    // Guardar el cliente en la base de datos
    const savedClient = await client.save();

    // Agregar promociones al nuevo cliente
    const updatedClient = await addPromotionsToClient(savedClient, accountId, null);

    // Añadir el cliente al array de `clients` de la cuenta
    await Account.findByIdAndUpdate(accountId, {
      $addToSet: { clients: { id: updatedClient._id, name: updatedClient.name, email: updatedClient.email } },
    });
    const convertedId = StrToObjectId(accountId);
    const account = await Account.findById(convertedId);
    // Crear un token JWT para el cliente
    const token = jwt.sign({ clientId: updatedClient._id }, process.env.JWT_SECRET, { expiresIn: "3000h" });
    await sendRegisterEmail(email, account);
    if (accountId === "67b628618c2a5a743bc72d61") {
      await logAction(email, "Contacto Web", `${formatName(name)} completo un formulario de contacto en ${formatName(account.name)}, leads`);
    } else {
      await logAction(email, "Registro y Login", `${formatName(name)} se registró y tuvo login exitoso en ${formatName(account.name)}`);
    }

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
    const updatedClient = await addPromotionsToClient(client, accountId, null);
    const account = await Account.findById(accountId);
    // Create JWT token
    const token = jwt.sign({ clientId: updatedClient._id }, process.env.JWT_SECRET, { expiresIn: "3000h" });
    logAction(email, "login", `Login de ${client.name} exitoso en ${account.name}`);
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
//Sumar puntos
router.post("/redeem-points", async (req, res) => {
  try {
    const { clientId, accountQr, promotionId } = req.body;
    let { clientEmail } = req.body;
    const today = getChileanDateTime();
    console.log(clientId, clientEmail, promotionId, accountQr);
    // Validate input
    if (!accountQr || !promotionId) {
      return res.status(400).json({ error: "Datos incompletos" });
    }
    if (!clientEmail && !clientId) {
      return res.status(400).json({ error: "Debe proporcionar clientEmail o clientId" });
    }
    // Find the promotion
    const existingPromotionData = await Promotion.findById(promotionId);
    if (!existingPromotionData) {
      return res.status(404).json({ error: "Promoción no encontrada" });
    }
    console.log(existingPromotionData);
    // Find the associated account
    const account = await Account.findOne({ owner: existingPromotionData.userID });
    if (!account) {
      return res.status(404).json({ error: "Cuenta asociada no encontrada" });
    }

    // Validate account QR (if needed)
    if (account.accountQr !== accountQr) {
      console.log(account.accountQr, accountQr);
      return res.status(401).json({ error: "Qr inválido." });
    }
    let client;
    if (clientId) {
      client = await Client.findById(clientId);
      if (client) {
        clientEmail = client.email; // Asignar el email del cliente encontrado
      }
    } else {
      client = await Client.findOne({ email: clientEmail });
    }

    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // Find the specific promotion for the client
    const addedPromotion = client.addedpromotions.find((promo) => promo.promotion.toString() === promotionId);

    if (!addedPromotion) {
      return res.status(404).json({ error: "Promoción no encontrada para este cliente" });
    }

    // Check promotion status and validity

    const todayScans = addedPromotion.visitDates.filter(
      (entry) => moment(entry.date).tz("America/Santiago").format("YYYY-MM-DD") === moment(today).tz("America/Santiago").format("YYYY-MM-DD")
    );
    if (todayScans.length > 0) {
      return res.status(400).json({ error: "Ya has agregado puntos hoy" });
    }

    // Determine points to add
    const pointsToAdd = existingPromotionData.pointsPerVisit || 1;

    // Update promotion points
    addedPromotion.pointsEarned += pointsToAdd;
    addedPromotion.actualVisits += 1;

    // Record visit
    addedPromotion.visitDates.push({
      date: today,
      pointsAdded: pointsToAdd,
    });

    // Add activity
    client.activities.push({
      type: "earned",
      description: `Puntos añadidos en promoción: ${existingPromotionData.title}`,
      amount: pointsToAdd,
      date: today,
      accountId: account._id,
      promotionId: promotionId,
    });

    // Check if promotion is completed
    if (addedPromotion.pointsEarned >= existingPromotionData.pointsRequired) {
      addedPromotion.status = "Completed";
    }

    // Save client updates
    await client.save();
    logAction(client.email, "Punto añadido", `Punto añadido: ${existingPromotionData.title}, en ${account.name}`);
    res.status(200).json({
      message: "Puntos añadidos exitosamente",
      pointsEarned: addedPromotion.pointsEarned,
      promotionStatus: addedPromotion.status,
    });
  } catch (error) {
    console.error("Error al canjear puntos:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});
//Canjear promocion one shot
router.post("/redeem-hot-promotion", async (req, res) => {
  try {
    const { email, accountId, promotionId } = req.body;
    console.log("🚀 ~ router.post ~ email, accountId, promotionId:", email, accountId, promotionId);
    const id = StrToObjectId(email);
    const convertedAccountId = StrToObjectId(accountId);
    const client = await Client.findById({
      _id: id,
      addedAccounts: { $elemMatch: { convertedAccountId } },
    });
    const today = getChileanDateTime();

    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const addedPromotion = client.addedpromotions.find((promo) => promo.promotion.toString() === promotionId);

    if (!addedPromotion) {
      return res.status(404).json({ error: "Promoción no encontrada" });
    }

    const lastRedeemDate = addedPromotion.lastRedeemDate;

    // Check if promotion was redeemed today
    if (lastRedeemDate && lastRedeemDate.toDateString() === today.toDateString()) {
      return res.status(400).json({
        error: "Ya has canjeado esta promoción hoy",
      });
    }

    addedPromotion.status = "Redeemed";
    addedPromotion.lastRedeemDate = getChileanDateTime();
    addedPromotion.redeemCount += 1;
    addedPromotion.visitDates.push({
      date: getChileanDateTime(),
      pointsAdded: 0,
    });
    // If promotion is recurrent, reset to Active for next day
    const promotion = await Promotion.findById(promotionId);
    if (promotion.promotionRecurrent === "True") {
      // Schedule the promotion to become Active again at midnight
      addedPromotion.status = "Active";
    }

    // Add activity
    client.activities.push({
      type: "visit",
      description: `Canje de promoción: ${promotion.title}`,
      date: today,
      accountId: accountId,
    });
    const account = await Account.findById(convertedAccountId);
    await client.save();
    sendRedemptionEmail(client.email, promotion.title, account);
    logAction(client.email, "Canje", `Canje de promoción: ${promotion.title}, en ${account.name}`);
    res.status(200).json({
      message: "Promoción canjeada exitosamente",
      promotion: addedPromotion,
    });
  } catch (error) {
    console.error("Error redeeming hot promotion:", error);
    res.status(500).json({ error: "Error al canjear la promoción" });
  }
});
//Canjear puntos por regalos
router.post("/redeem-promotion-reward", async (req, res) => {
  try {
    const { email, accountId, promotionId, rewardId, points } = req.body;
    console.log("🚀 ~ router.post ~ req.body:", req.body);
    const today = getChileanDateTime();
    // Find the promotion
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ error: "Promoción no encontrada" });
    }

    const convertedAccId = StrToObjectId(accountId);
    const account = await Account.findOne({ _id: convertedAccId });
    if (!account) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }

    // Find the specific reward
    const reward = promotion.rewards.find((r) => r._id.toString() === rewardId);
    if (!reward && promotion.systemType === "points") {
      return res.status(404).json({ error: "Recompensa no encontrada" });
    }

    const convertedId = StrToObjectId(email);
    console.log("🚀 ~ router.post ~ convertedId:", convertedId);

    const client = await Client.findOne({
      _id: convertedId,
      addedAccounts: { $elemMatch: { accountId: account._id } },
    });

    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // Find the client's specific promotion
    const clientPromotion = client.addedpromotions.find((promo) => promo.promotion.toString() === promotionId);
    console.log("🚀 ~ router.post ~ clientPromotion:", clientPromotion);

    if (!clientPromotion) {
      return res.status(400).json({ error: "Promoción no asociada con el cliente" });
    }

    // Handle promotions of type 'visits'
    if (promotion.systemType === "visits") {
      console.log("El tipo de sistema es 'visits', registrando canje de visita.");

      // Check if promotion was redeemed today
      const todayString = moment(today).tz("America/Santiago").format("YYYY-MM-DD");
      if (promotion.lastRedeemDate === todayString) {
        return res.status(400).json({ error: "Ya has canjeado una promoción hoy" });
      }

      // Increment visit count
      clientPromotion.visitCount = (clientPromotion.visitCount || 0) + 1;

      // Increment redeem count
      clientPromotion.redeemCount = (clientPromotion.redeemCount || 0) + 1;

      // Set lastRedeemDate to today's date
      promotion.lastRedeemDate = today;

      // Add activity for visit redemption (no points deducted)
      client.activities.push({
        type: "visit_redeemed",
        description: `Canje de visita para promoción: ${promotion.title}`,
        amount: 0, // No points for 'visits'
        date: today,
        accountId: account._id,
        promotionId: promotionId,
      });

      // Save client and promotion updates
      await client.save();
      await promotion.save();
      await sendRedemptionEmail(client.email, reward.description, account);
      logAction(client.email, "Canje", `Promocion canjeada: ${addedPromotion.title}, en ${account.name}`);

      return res.status(200).json({
        message: "Visita canjeada exitosamente",
        visitCount: clientPromotion.visitCount,
        redeemCount: clientPromotion.redeemCount,
      });
    }

    // Handle promotions of type 'points'
    if (promotion.systemType === "points") {
      console.log("El tipo de sistema es 'points', verificando puntos disponibles.");

      // Check if client has enough points
      if (clientPromotion.pointsEarned < reward.points) {
        return res.status(400).json({ error: "Puntos insuficientes para canjear esta recompensa" });
      }

      // Deduct points
      clientPromotion.pointsEarned -= reward.points;

      // Increment redeem count
      clientPromotion.redeemCount = (clientPromotion.redeemCount || 0) + 1;

      // Add activity for reward redemption
      client.activities.push({
        type: "reward_redeemed",
        description: `Canje de recompensa: ${reward.description}`,
        amount: reward.points,
        date: getChileanDateTime(),
        accountId: account._id,
        promotionId: promotionId,
      });

      // Save client updates
      await client.save();
      await promotion.save();
      logAction(client.email, `Canje de recompensa - Puntos ${reward.points}`, `Recompensa: ${reward.description}, en ${account.name}`);
      return res.status(200).json({
        message: "Recompensa canjeada exitosamente",
        pointsRemaining: clientPromotion.pointsEarned,
        redeemCount: clientPromotion.redeemCount,
      });
    }

    // If promotion systemType is unknown
    return res.status(400).json({ error: "Tipo de promoción no reconocido" });
  } catch (error) {
    console.error("Error al canjear recompensa:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// QR Point Scanning Route
router.post("/scan-qr-points", async (req, res) => {
  try {
    const { clientEmail, promotionId, accountQr } = req.body;
    console.log("🚀 ~ router.post ~ clientEmail, promotionId, accountQr:", clientEmail, promotionId, accountQr);
    const today = getChileanDateTime();
    // Validate input
    if (!accountQr || !promotionId || !clientEmail) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    // Find client
    const client = await Client.findOne({
      email: clientEmail,
      addedpromotions: { $elemMatch: { promotion: promotionId } },
    });

    if (!client) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // Find specific added promotion
    const addedPromotion = client.addedpromotions.find((promo) => promo.promotion.toString() === promotionId);

    // Check if point already added today
    const todayScans = addedPromotion.visitDates.filter(
      (entry) => moment(entry.date).tz("America/Santiago").format("YYYY-MM-DD") === moment(today).tz("America/Santiago").format("YYYY-MM-DD")
    );

    if (todayScans.length > 0) {
      return res.status(400).json({ error: "Ya has agregado puntos hoy" });
    }

    // Add point
    const pointsToAdd = 1; // Default point
    addedPromotion.pointsEarned += pointsToAdd;

    // Record visit
    addedPromotion.visitDates.push({
      date: getChileanDateTime(),
      pointsAdded: pointsToAdd,
    });

    // Add activity
    client.activities.push({
      type: "earned",
      description: "Puntos añadidos por escaneo QR",
      amount: pointsToAdd,
      date: today,
    });

    await client.save();
    const account = await Account.findOne({ accountQr: accountQr });
    logAction(client.email, "scan", `Punto añadido: ${addedPromotion.title}, en ${account.name}`);

    res.status(200).json({
      message: "Punto añadido exitosamente",
      pointsEarned: addedPromotion.pointsEarned,
    });
  } catch (error) {
    console.error("Error scanning QR points:", error);
    res.status(500).json({ error: "Error al escanear puntos" });
  }
});

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
    const currentDate = getChileanDateTime();
    // Add activity
    client.activities.push({
      type: activity.type,
      description: activity.description,
      amount: activity.amount,
      promotionId: activity.promotionId,
      date: currentDate,
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

const formatName = (name) => {
  return name
    .split(" ")
    .map((word) => {
      if (word.length === 0) return "";
      // Convertir solo la primera letra a mayúscula manteniendo el resto igual
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .filter((word) => word.length > 0)
    .join(" ");
};

module.exports = router;
