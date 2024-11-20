const jwt = require("jsonwebtoken");
const Promotion = require("./promotions.model");
const Client = require("./client.model");
const User = require("../auth/User.model");
const Account = require("../accounts/Account.model");
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const qr = require("qrcode");
const fs = require("fs");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const { sendSSEMessageToClient } = require("../events/eventController.js");
const log = require("../logger/logger.js");
const { StrToObjectId } = require("../utils/StrToObjectId.js");
const moment = require("moment");
const PromotionRegistration = require("./PromotionRegistration.model");

exports.createPromotion = async (req, res) => {
  try {
    const { email, systemType } = req.body;
    console.log("CreatePromotion");
    console.log(req.body);
    // Obtener usuario y cuenta
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const account = await Account.findOne({ userEmails: user.email });
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const promotionData = {
      userID: account.owner,
      title: req.body.promotionDetails.title,
      description: req.body.promotionDetails.description,
      conditions: req.body.promotionDetails.conditions,
      promotionType: req.body.promotionDetails.promotionType,
      promotionRecurrent: req.body.systemType === "points" ? "True" : req.body.promotionRequirements.isRecurrent ? "True" : "False", // Recurrente es siempre true si es de "points"
      promotionDuration: Number(req.body.promotionRequirements.promotionDuration),
      imageUrl: req.body.imageUrl || "",
      systemType: req.body.systemType, // "points" o "visits"
      pointSystem: req.body.systemType === "points",
      rewards: req.body.promotionRequirements.rewards || [],
    };

    // Agregar visitas requeridas solo si el sistema es de visitas
    if (req.body.systemType === "visits") {
      // Asegurarse de que 'visitsRequired' esté presente y sea un número
      const visitsRequired = Number(req.body.promotionRequirements.visitsRequired);
      if (isNaN(visitsRequired)) {
        return res.status(400).json({ error: "visitsRequired must be a valid number" });
      }
      promotionData.visitsRequired = visitsRequired;
    }

    const promotion = new Promotion(promotionData);

    // Guardar la promoción en la base de datos
    await promotion.save();

    // Asociar la promoción a la cuenta y guardar
    account.promotions.push(promotion._id);
    await account.save();

    // Registrar la acción de creación de la promoción
    log.logAction(email, "createPromotion", promotion.title);

    // Responder con éxito y los datos de la promoción creada
    res.status(201).json(promotion);
  } catch (error) {
    console.error("Error creating promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
exports.updatePromotion = async (req, res) => {
  const promotionId = req.params.pid;
  const { title, description, promotionType, promotionRecurrent, visitsRequired, benefitDescription, promotionDuration, conditions } = req.body;
  console.log("UpdatePromotion");
  console.log(req.body);

  try {
    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    promotion.title = title;
    promotion.description = description;
    promotion.promotionType = promotionType;
    promotion.promotionRecurrent = promotionRecurrent;
    promotion.visitsRequired = visitsRequired;
    promotion.benefitDescription = benefitDescription;
    promotion.promotionDuration = promotionDuration;
    promotion.conditions = conditions;

    if (req.body.imageUrl) {
      promotion.imageUrl = req.body.imageUrl;
    }

    await promotion.save();
    res.status(200).json(promotion);
  } catch (error) {
    console.error("Error editing promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
exports.getPromotions = async (req, res) => {
  try {
    const email = req.email;

    // Buscar usuario por email
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Obtener promociones del usuario
    const promotions = await Promotion.find({ userID: user._id });

    // Obtener los IDs de promociones
    const promotionIds = promotions.map((promotion) => promotion._id.toString());

    // Buscar clientes con promociones asociadas a los IDs de promoción del usuario
    const clients = await Client.find({ "addedpromotions.promotion": { $in: promotionIds } });

    // Calcular métricas
    let totalVisitsCount = 0;
    let totalPointsCount = 0;
    let redeemedGiftsCount = 0;

    // Calcular métricas de visitas, puntos y redenciones
    clients.forEach((client) => {
      (client.addedpromotions || []).forEach((promotionEntry) => {
        if (promotionIds.includes(promotionEntry.promotion.toString())) {
          const promotionDetails = promotions.find((promo) => promo._id.toString() === promotionEntry.promotion.toString());
          if (promotionDetails) {
            // Verificación adicional de tipo de sistema
            if (promotionDetails.systemType === "points") {
              totalPointsCount += promotionEntry.pointsEarned || 0;
            }
            redeemedGiftsCount += typeof promotionEntry.redeemCount === "number" ? promotionEntry.redeemCount : 0;
          }

          // Revisa y suma la cantidad de fechas de visita
          if (Array.isArray(promotionEntry.visitDates)) {
            totalVisitsCount += promotionEntry.visitDates.length;
          } else {
          }
        }
      });
    });
    //console.log("Total de puntos:", totalPointsCount);
    //console.log("Total de visitas:", totalVisitsCount);

    // Responder con las promociones y métricas actualizadas
    res.status(200).json({
      promotions,
      metrics: {
        activePromotions: promotions.length,
        registeredClients: clients.length,
        totalVisits: totalVisitsCount,
        totalPoints: totalPointsCount,
        redeemedGifts: redeemedGiftsCount,
      },
    });
  } catch (error) {
    console.error("Error fetching promotions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getPromotionById = async (req, res) => {
  let token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.name = decoded.name;
      req.email = decoded.email;
      req.userid = decoded.id;
    } catch (err) {
      // Manejar error de token inválido si es necesario
      console.error("Invalid token:", err);
    }
  }

  try {
    const promotion = await Promotion.findById(req.params.id);

    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    const account = await Account.findOne({ owner: StrToObjectId(promotion.userID.toString()) });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    promotion.accountId = account._id.toString();

    // Obtener clientes con la promoción
    const clients = await Client.aggregate([
      { $match: { "addedpromotions.promotion": promotion._id } },
      {
        $project: {
          name: 1,
          email: 1,

          totalPoints: 1,

          phoneNumber: 1,

          addedpromotions: {
            $filter: {
              input: "$addedpromotions",
              as: "promotion",
              cond: { $eq: ["$$promotion.promotion", promotion._id] },
            },
          },
        },
      },
    ]);

    // Inicializar variables de estadísticas
    let totalPoints = 0;
    let totalVisits = 0;
    let pointsPerDay = [];
    let visitsPerDay = [];

    const clientList = clients.map((client) => {
      const promotionData = client.addedpromotions[0];
      if (promotionData) {
        if (promotionData.systemType === "points") {
          // Acumular puntos
          const points = promotionData.pointsEarned || 0;
          client.totalPoints = points;
          totalPoints += points;
        } else if (promotionData.systemType === "visits") {
          // Acumular visitas
          const visits = promotionData.actualVisits || 0;
          client.totalVisits = visits;
          totalVisits += visits;
        }
      }
      return {
        name: client.name,
        email: client.email,
        phoneNumber: client.phoneNumber,
        id: client._id,
        totalPoints: client.totalPoints,
        totalVisits: client.totalVisits,
        status: client.addedpromotions[0]?.status || "Unknown",
      };
    });

    // Agregar estadísticas basadas en el systemType
    if (promotion.systemType === "visits") {
      const visitDatesAggregate = await Client.aggregate([
        { $match: { "addedpromotions.promotion": promotion._id } },
        { $unwind: "$addedpromotions" },
        { $match: { "addedpromotions.promotion": promotion._id } },
        { $unwind: "$addedpromotions.visitDates" },
        {
          $addFields: {
            normalizedDate: {
              $switch: {
                branches: [
                  // Caso 1: Cuando visitDates es directamente una fecha
                  {
                    case: { $eq: [{ $type: "$addedpromotions.visitDates" }, "date"] },
                    then: "$addedpromotions.visitDates",
                  },
                  // Caso 2: Cuando visitDates tiene una propiedad date
                  {
                    case: { $eq: [{ $type: "$addedpromotions.visitDates.date" }, "date"] },
                    then: "$addedpromotions.visitDates.date",
                  },
                ],
                default: null,
              },
            },
          },
        },
        {
          $match: {
            normalizedDate: { $ne: null },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$normalizedDate",
              },
            },
            visits: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      visitsPerDay = visitDatesAggregate.map((entry) => ({
        date: entry._id,
        visits: entry.visits,
      }));
    } else if (promotion.systemType === "points") {
      const pointsPerDayAggregate = await Client.aggregate([
        { $match: { "addedpromotions.promotion": promotion._id } },
        { $unwind: "$addedpromotions" },
        { $match: { "addedpromotions.promotion": promotion._id } },
        { $unwind: "$addedpromotions.visitDates" },
        {
          $project: {
            date: {
              $cond: {
                if: { $eq: [{ $type: "$addedpromotions.visitDates" }, "date"] },
                then: "$addedpromotions.visitDates",
                else: "$addedpromotions.visitDates.date",
              },
            },
            pointsAdded: {
              $cond: {
                if: { $eq: [{ $type: "$addedpromotions.visitDates" }, "date"] },
                then: 1, // valor por defecto para registros antiguos
                else: "$addedpromotions.visitDates.pointsAdded",
              },
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$date" },
            },
            points: { $sum: "$pointsAdded" },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      pointsPerDay = pointsPerDayAggregate.map((entry) => ({
        date: entry._id,
        points: entry.points,
      }));
    }

    const statistics = {
      TotalClients: clients.length,
      ActiveClients: clientList.filter((client) => client.status === "Active").length,
      ExpiredClients: clientList.filter((client) => client.status === "Expired").length,
      RedeemedClients: clientList.filter((client) => client.status === "Redeemed").length,
      TotalVisit: promotion.systemType === "visits" ? totalVisits : 0,
      TotalPoints: promotion.systemType === "points" ? totalPoints : 0,
      TotalVisits: promotion.systemType === "visits" ? totalVisits : 0, // Asegurar que esté correctamente asignado
      visitsPerDay: promotion.systemType === "visits" ? visitsPerDay : [],
      pointsPerDay: promotion.systemType === "points" ? pointsPerDay : [],
      clientList: clientList,
    };

    promotion.statistics = statistics;

    res.status(200).json({
      promotion,
      accountId: promotion.accountId,
      accountLogo: account.logo,
      accountSocialMedia: account.socialMedia,
      statistics,
    });
  } catch (error) {
    console.error("Error fetching promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.addClientToPromotion = async (req, res) => {
  const { promotionId, clientEmail, clientName, clientPhone } = req.body;
  console.log("AddClientToPromotion");
  console.log(req.body);

  if (!promotionId || !clientEmail) {
    return res.status(400).json({ error: "Missing promotion ID or client email" });
  }

  try {
    const existingPromotiondata = await Promotion.findById(promotionId);
    if (!existingPromotiondata) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    const account = await Account.findOne({ owner: StrToObjectId(existingPromotiondata.userID) });
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    let client = await Client.findOne({ email: clientEmail });

    if (!client) {
      client = new Client({ email: clientEmail, name: clientName, phoneNumber: clientPhone });
      console.log("Client created:", client);
    }

    const existingAccount = client.addedAccounts.find((acc) => acc.accountId.toString() === account._id.toString());

    if (!existingAccount) {
      client.addedAccounts.push({ accountId: account._id });
    }

    const existingPromotion = client.addedpromotions.find((promotion) => promotion.promotion.toString() === promotionId);

    if (existingPromotion) {
      // **Establecer la cookie para clientId**
      setClientIdCookie(res, client._id.toString(), promotionId);
      return res.status(400).json({ error: "Client already has this promotion" });
    }

    // Añadir la promoción a addedpromotions y asegurarse de incluir systemType
    const newPromotion = {
      promotion: promotionId,
      addedDate: new Date(),
      endDate: new Date(Date.now() + existingPromotiondata.promotionDuration * 24 * 60 * 60 * 1000), // Duración en milisegundos
      status: "Active",
      systemType: existingPromotiondata.systemType, // Agregar el systemType aquí
    };

    client.addedpromotions.push(newPromotion);

    // Aquí verificamos qué tipo de sistema de promoción es
    if (existingPromotiondata.systemType === "visits") {
      // Si la promoción es basada en visitas
      client.addedpromotions[client.addedpromotions.length - 1].actualVisits = 0; // Inicializar el contador de visitas
    } else if (existingPromotiondata.systemType === "points") {
      // Si la promoción es basada en puntos
      client.addedpromotions[client.addedpromotions.length - 1].pointsEarned = 0; // Inicializar los puntos ganados
    }

    const accountClientExists = account.clients.find((accClient) => accClient.email === clientEmail);

    if (!accountClientExists) {
      account.clients.push({
        id: client._id,
        name: clientName,
        email: clientEmail,
        phoneNumber: clientPhone,
        addedPromotions: [
          {
            promotion: promotionId,
            addedDate: new Date(),
            endDate: new Date(Date.now() + existingPromotiondata.promotionDuration * 24 * 60 * 60 * 1000), // Duración
            systemType: existingPromotiondata.systemType, // Agregar el systemType aquí también
          },
        ],
      });
    }

    await sendEmailWithQRCode(clientEmail, existingPromotiondata, client._id, existingPromotiondata._id, existingPromotiondata.title);
    await client.save();
    await account.save();

    // **Establecer la cookie para clientId**
    setClientIdCookie(res, client._id.toString(), promotionId);

    // Crear el registro de la promoción
    const promotionRegistration = new PromotionRegistration({
      accountId: account._id,
      clientId: client._id,
      promotionId: promotionId,
      clientEmail: clientEmail,
      clientName: clientName || "Sin nombre",
      promotionTitle: existingPromotiondata.title,
      systemType: existingPromotiondata.systemType,
    });

    // Guardar el registro
    await promotionRegistration.save();

    log.logAction(clientEmail, "addclient", `Client ${clientEmail} added to promotion ${existingPromotiondata.title} (Account: ${account._id})`);

    res.status(201).json({
      message: "Client added to promotion successfully",
      client,
      registrationId: promotionRegistration._id,
    });
  } catch (error) {
    console.error("Error adding client to promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const setClientIdCookie = async (res, clientId, promotionId) => {
  // **Establecer la cookie para clientId**
  res.cookie("clientId", clientId, {
    path: `/promotion/${promotionId}`, // Hacerla específica para esta promoción
    expires: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), // 10 años en milisegundos

    //Comentar los siguientes parametros en DEV para que funcione
    sameSite: "None", // Previene el envío de cookies en solicitudes de terceros
    secure: true, // Solo en HTTPS
    domain: "fidelidapp.cl", // Replace with your domain
  });
};

exports.getClientPromotion = async (req, res) => {
  const clientId = req.params.cid;
  const promotionId = req.params.pid;

  try {
    // Encuentra al cliente por su ID
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // Encuentra la promoción específica del cliente usando el promotionId
    const promotion = client.addedpromotions.find((promo) => promo.promotion.toString() === promotionId);

    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found for this client" });
    }

    const account = await Account.find({
      promotions: promotion.promotion,
    });
    console.log("esto es account social media", promotion.promotion);
    const socialMedia = {
      facebook: account[0].socialMedia.facebook,
      instagram: account[0].socialMedia.instagram,
      logo: account[0].logo,
      whatsapp: account[0].socialMedia.whatsapp,
      website: account[0].socialMedia.website,
    };
    // Obtiene los detalles de la promoción desde la colección de promociones
    const promotionDetails = await Promotion.findById(promotionId);
    if (!promotionDetails) {
      return res.status(404).json({ error: "Promotion details not found" });
    }

    // Verifica si la fecha de la promoción ha expirado y actualiza el estado
    const currentDate = new Date();
    const promotionEndDate = new Date(promotion.endDate);

    if (currentDate > promotionEndDate) {
      // Si la promoción ha expirado, actualiza su estado
      promotion.status = "Expired";
      // Guarda los cambios en la base de datos
      await client.save();
    }

    // Lógica para mostrar puntos o visitas según el tipo de sistema
    let promotionData = {};

    if (promotionDetails.systemType === "points") {
      promotionData = {
        ...promotion.toObject(), // Usamos .toObject() para convertir el documento a un objeto simple
        pointsEarned: promotion.pointsEarned || 0,
        totalPointsRequired: promotionDetails.totalPointsRequired || 0,
      };
    } else if (promotionDetails.systemType === "visits") {
      promotionData = {
        ...promotion.toObject(),
        actualVisits: promotion.actualVisits || 0,
        totalVisitsRequired: promotionDetails.totalVisitsRequired || 0,
      };
    } else {
      promotionData = promotion.toObject(); // Si no es ni puntos ni visitas, simplemente devolvemos la promoción tal cual
    }

    // Respuesta final con los datos de la promoción, detalles y cliente
    const response = {
      promotion: promotionData,
      promotionDetails: promotionDetails,
      client: {
        _id: client._id,
        email: client.email,
        name: client.name,
        phoneNumber: client.phoneNumber,
      },
      socialMedia: socialMedia,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching client promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const sendCompletedPromotionMail = async (clientEmail, existingPromotiondata, clientid, existingPromotiondataid, promotionTitle) => {
  try {
    const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"; // Replace with your actual logo URL
    const msg = {
      to: clientEmail,
      from: "contacto@fidelidapp.cl",
      subject: "¡Felicidades! ¡Has ganado tu promoción!",
      html: `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Promoción Ganada</title>
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
          </style>
        </head>
        <body>
          <div class="container">
            <div class="content">
              <h1>¡Felicidades! ¡Has ganado tu promoción!</h1>
              <h2>${promotionTitle}</h2>
              <p>¡Enhorabuena! Has cumplido con los requisitos para ganar la promoción.</p>
              <p><strong>Descripción de la promoción:</strong> ${existingPromotiondata.description}</p>
              <p><strong>Visitas Requeridas:</strong> ${existingPromotiondata.visitsRequired}</p>
              <p>Para canjear tu premio, haz clic en el siguiente enlace:</p>
              <a href="${process.env.BASE_URL}/promotions/${clientid}/${existingPromotiondataid}" class="button">Canjear mi Fidelicard</a>
              <p><strong>Condiciones aplicables:</strong> ${existingPromotiondata.conditions}</p>
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
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
  }
};
exports.redeemPoints = async (req, res) => {
  const { clientEmail, promotionId, accountQr } = req.body;

  if (!accountQr || !promotionId || !clientEmail) {
    return res.status(400).json({ error: "Missing promotion ID, client email, or AccountQR" });
  }

  const existingPromotiondata = await Promotion.findById(promotionId);
  if (!existingPromotiondata) {
    return res.status(404).json({ error: "Promotion not found" });
  }

  const account = await Account.findOne({ owner: existingPromotiondata.userID._id });
  if (!account) {
    return res.status(404).json({ error: "Associated account not found" });
  }

  if (account.accountQr !== accountQr) {
    return res.status(401).json({ error: "Invalid daily key" });
  }

  let client = await Client.findOne({ email: clientEmail });
  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  try {
    const promotion = client.addedpromotions.find((promo) => promo.promotion.toString() === promotionId);

    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found for this client" });
    }

    if (promotion.status === "Completed") {
      return res.status(400).json({ error: "Promotion already completed" });
    }

    if (promotion.status === "Redeemed" || promotion.status === "Expired") {
      return res.status(400).json({ error: "Promotion already " + promotion.status });
    }

    if (promotion.endDate < new Date()) {
      promotion.status = "Expired";
      await client.save();
      return res.status(400).json({ error: "Promotion already expired" });
    }

    if (promotion.visitDates.some((entry) => entry.date.toDateString() === new Date().toDateString())) {
      return res.status(400).json({ error: "Point already redeemed today" });
    }

    const pointsToAdd = existingPromotiondata.pointsPerVisit || 1;
    promotion.actualPoints += pointsToAdd;
    promotion.pointsEarned += pointsToAdd; // Incrementar pointsEarned

    promotion.visitDates.push({ date: new Date(), pointsAdded: pointsToAdd });

    if (promotion.actualPoints >= existingPromotiondata.pointsRequired) {
      promotion.status = "Pending";

      const qrLink = `${process.env.BASE_URL}/redeem-promotion/${client._id}/${promotionId}`;
      const qrCodeBuffer = await QRCode.toBuffer(qrLink);

      await sendCompletedPromotionMail(clientEmail, existingPromotiondata, client._id, existingPromotiondata._id, existingPromotiondata.title, qrCodeBuffer);

      await client.save();
      log.logAction(clientEmail, "redeemPoints", promotion.title);
      res.status(200).json({ message: "Promotion completed, QR generated", qrCode: qrCodeBuffer.toString("base64"), promotion });
    } else {
      await client.save();
      log.logAction(clientEmail, "redeemPoints", promotion.title);
      res.status(200).json({ message: "Point redeemed successfully", client });
    }
  } catch (error) {
    console.error("Error redeeming points:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.redeemVisits = async (req, res) => {
  const { promotionId, clientEmail } = req.body;

  try {
    const existingPromotiondata = await Promotion.findById(promotionId);
    if (!existingPromotiondata) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    const client = await Client.findOne({ email: clientEmail });
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const promotion = client.addedpromotions.find((p) => p.promotion.toString() === promotionId);

    if (!promotion) {
      return res.status(404).json({ error: "Client does not have this promotion" });
    }

    // Verificar si ya visitó hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const hasVisitedToday = promotion.visitDates.some((visit) => {
      const visitDate = new Date(visit.date);
      visitDate.setHours(0, 0, 0, 0);
      return visitDate.getTime() === today.getTime();
    });

    if (hasVisitedToday) {
      return res.status(400).json({ error: "Ya has registrado una visita hoy" });
    }

    // Actualizar los datos de visita
    promotion.actualVisits += 1;
    // Agregar la nueva visita con la estructura correcta
    promotion.visitDates.push({
      date: new Date(),
      pointsAdded: 0, // Como es sistema de visitas, ponemos 0 o podemos omitir este campo
    });

    if (promotion.actualVisits >= existingPromotiondata.visitsRequired) {
      promotion.status = "Pending";

      const qrLink = `${process.env.BASE_URL}/redeem-promotion/${client._id}/${promotionId}`;
      const qrCodeBuffer = await QRCode.toBuffer(qrLink);

      await sendCompletedPromotionMail(clientEmail, existingPromotiondata, client._id, existingPromotiondata._id, existingPromotiondata.title, qrCodeBuffer);

      await client.save();
      log.logAction(clientEmail, "redeemVisits", promotion.title);
      res.status(200).json({
        message: "Promotion completed, QR generated",
        qrCode: qrCodeBuffer.toString("base64"),
        promotion,
      });
    } else {
      await client.save();
      log.logAction(clientEmail, "redeemVisits", promotion.title);
      res.status(200).json({
        message: "Visits redeemed successfully",
        client,
      });
    }
  } catch (error) {
    console.error("Error redeeming visits:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

//See if we need to reduce the redeem with points ??
exports.redeemPromotionByQRCode = async (req, res) => {
  const { clientEmail, promotionId } = req.body;
  console.log(clientEmail, promotionId);

  try {
    const client = await Client.findOne({ email: clientEmail });
    console.log(client);

    const promotion = client.addedpromotions.find((p) => p.promotion.toString() === promotionId);

    if (!client || !promotion) {
      return res.status(404).json({ error: "Client or promotion not found" });
    }

    if (promotion.status === "Redeemed" || promotion.status === "Expired") {
      return res.status(400).json({ error: "Promotion already completed or expired" });
    }

    //Find the promotion in the client array and update the status actual visits and redeem count
    client.addedpromotions = client.addedpromotions.map((p) => {
      if (p.promotion.toString() === promotionId) {
        p.actualVisits = 0;
        p.redeemCount = (p.redeemCount || 0) + 1;
        p.status = "Redeemed";
      }
      return p;
    });

    await client.save();

    console.log("Client:", client);

    res.status(200).json({ message: "Promotion completed successfully" });
  } catch (error) {
    console.error("Error redeeming promotion by QR:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.deletePromotion = async (req, res) => {
  const promotionId = req.params.id;
  if (!promotionId) {
    return res.status(400).json({ error: "Missing promotion ID" });
  }

  try {
    const promotion = await Promotion.findByIdAndDelete(promotionId);
    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found" });
    }
    res.status(200).json({ message: "Promotion deleted successfully" });
  } catch (error) {
    console.error("Error deleting promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.restartPromotion = async (req, res) => {
  const { promotionId, clientEmail } = req.body;

  if (!promotionId || !clientEmail) {
    return res.status(400).json({ error: "Missing promotion ID, or client email" });
  }

  try {
    // Find the promotion details
    const existingPromotiondata = await Promotion.findById(promotionId);
    if (!existingPromotiondata) {
      return res.status(404).json({ error: "Promotion details not found" });
    }
    if (existingPromotiondata.promotionRecurrent === "False") {
      res.status(400).json({ error: "La promoción no es recurrente!" });
    }

    // Find the client by email
    let client = await Client.findOne({ email: clientEmail });
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // Find the promotion in the client's addedpromotions array
    const promotion = client.addedpromotions.find((promotion) => promotion.promotion.toString() === promotionId);

    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found for this client" });
    }

    // Reset promotion details if the promotion is reccurent
    promotion.status = "Active";
    promotion.actualVisits = 0;
    promotion.addedDate = new Date();
    promotion.endDate = new Date(Date.now() + existingPromotiondata.promotionDuration * 24 * 60 * 60 * 1000); // Add promotion duration in milliseconds

    // Save the updated client document
    await client.save();
    log.logAction(clientEmail, "restartPromotion", promotion.title);

    res.status(200).json({ message: "Promotion restarted successfully", client });
  } catch (error) {
    console.error("Error restarting promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.redeemPromotion = async (req, res) => {
  const { promotionId, clientEmail, pointsToRedeem } = req.body;

  if (!promotionId || !clientEmail || !pointsToRedeem) {
    return res.status(400).json({ error: "Missing promotion ID, client email or points to redeem" });
  }

  try {
    const existingPromotiondata = await Promotion.findById(promotionId);
    if (!existingPromotiondata) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    let client = await Client.findOne({ email: clientEmail });
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const promotion = client.addedpromotions.find((promotion) => promotion.promotion.toString() === promotionId);
    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found for this client" });
    }

    if (promotion.actualVisits < pointsToRedeem) {
      return res.status(400).json({ error: "Not enough points to redeem" });
    }

    if (existingPromotiondata.promotionRecurrent === "True") {
      promotion.status = "Active";
      promotion.actualVisits = promotion.actualVisits - pointsToRedeem;
      promotion.endDate = new Date(Date.now() + existingPromotiondata.promotionDuration * 24 * 60 * 60 * 1000);
      promotion.lastRedeemDate = new Date();
      promotion.redeemCount = (promotion.redeemCount || 0) + 1;
    } else {
      promotion.status = "Redeemed";
      promotion.lastRedeemDate = new Date();
      promotion.redeemCount = (promotion.redeemCount || 0) + 1;
    }

    await client.save();
    log.logAction(clientEmail, "restartPromotion", promotion.title);
    res.status(200).json({ message: "Promotion redeemed successfully", client });
  } catch (error) {
    console.error("Error restarting promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.redeemPromotionPoints = async (req, res) => {
  try {
    const { promotionId, clientEmail, rewardId } = req.body;

    const promotion = await Promotion.findById(promotionId);
    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found" });
    }
    const account = await Account.findOne({ owner: promotion.userID });
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    const reward = promotion.rewards.find((r) => r._id.toString() === rewardId);
    if (!reward) {
      return res.status(404).json({ error: "Reward not found" });
    }

    const client = await Client.findOne({ email: clientEmail });
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const clientPromotion = client.addedpromotions.find((promo) => promo.promotion.toString() === promotionId);
    if (!clientPromotion) {
      return res.status(400).json({ error: "Promotion not associated with client" });
    }

    if (clientPromotion.pointsEarned < reward.points) {
      return res.status(400).json({ error: "Not enough points to redeem this reward" });
    }

    clientPromotion.pointsEarned -= reward.points;
    clientPromotion.redeemCount = (clientPromotion.redeemCount || 0) + 1;

    await client.save();
    const remainingPoints = clientPromotion.pointsEarned; // Puntos restantes

    const msg = {
      to: client.email,
      from: account.senderEmail || "contacto@fidelidapp.cl",
      subject: `Canje de Promoción ${account.name ? "-" + account.name : ""}`,
      html: `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Canje de Promoción</title>
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
              <h1>Hola ${client.name}!</h1>
              <h2>Has canjeado la recompensa "${reward.description}" por ${reward.points} puntos.</h2>
              <p>¡Gracias por tu lealtad!</p>
              <p><strong>Puntos restantes en tu cuenta:</strong> ${remainingPoints}</p>
              <p><strong>Fecha del canje:</strong> ${new Date().toLocaleDateString("es-CL")}</p> <!-- Fecha del canje -->
              <p>Si tienes alguna duda sobre tu promoción, puedes verla haciendo clic en el siguiente enlace:</p>
              <a href="${process.env.BASE_URL}/promotions/${client.id}/${promotionId}" class="button">Ver tu Fidelicard</a>
              <p>Recuerda que para validar tus visitas o sumar puntos, simplemente escanea el QR de la tienda desde tu FidelidCard.</p>
              <p>¡Nos alegra contar con clientes tan leales como tú!</p>
            </div>
            <div class="footer">
              <img src="${
                account.logo || "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"
              }" alt="FidelidApp Logo" height="100">
              <p>&copy; ${new Date().getFullYear()} FidelidApp. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    await sgMail.send(msg);

    res.status(200).json({ message: "Promotion redeemed successfully", pointsRemaining: clientPromotion.pointsEarned });
  } catch (error) {
    console.error("Error redeeming promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

<<<<<<< Updated upstream
=======
exports.getDashboardMetrics = async (req, res) => {
  const timePeriod = req.body.timePeriod || 7;

  console.log("⭐ Iniciando getDashboardMetrics");
  console.log("Período de tiempo solicitado:", timePeriod, "días");

  const sevenDaysAgo = moment().subtract(timePeriod, "days").startOf("day");

  console.log("Getting dashboard metrics for email:", req.email);

  try {
    const account = await Account.findOne({ userEmails: req.email }).populate("promotions");
    console.log("📊 Cuenta encontrada:", {
      email: req.email,
      numPromotions: account?.promotions?.length || 0,
    });

    const clients = await Client.find({ "addedAccounts.accountId": account._id });
    console.log("👥 Número de clientes encontrados:", clients.length);

    const accountPromotionIds = account.promotions.map((id) => new mongoose.Types.ObjectId(id));

    let totalClients = 0;
    let totalVisits = 0;
    let totalPoints = 0;
    let totalRedeemCount = 0;
    const totalPromotions = accountPromotionIds.length;
    const visitDataByClient = [];
    const pointDataByClient = [];
    const dailyData = {};

    // Prepare dailyData structure
    for (let i = 0; i < timePeriod; i++) {
      const date = moment().subtract(i, "days").format("YYYY-MM-DD");
      dailyData[date] = { date: date, visits: 0, points: 0, registrations: 0 };
    }

    // Process each client
    for (const client of clients) {
      console.log("\n🔄 Procesando cliente:", client.email);

      const registrationDate = moment(client.createdAt || client._id.getTimestamp()).format("YYYY-MM-DD");

      // Update dailyData for registrations
      if (dailyData[registrationDate]) {
        dailyData[registrationDate].registrations++;
      }

      const pointsDaysAggregate = await Client.aggregate([
        { $match: { _id: client._id } },
        { $unwind: "$addedpromotions" },
        { $match: { "addedpromotions.promotion": { $in: accountPromotionIds } } },
        { $unwind: "$addedpromotions.visitDates" },
        {
          $match: {
            "addedpromotions.visitDates.date": { $exists: true, $type: "date" },
            "addedpromotions.visitDates.pointsAdded": { $exists: true, $type: "number" },
          },
        },
        {
          $project: {
            email: 1,
            date: { $dateToString: { format: "%Y-%m-%d", date: "$addedpromotions.visitDates.date" } },
            pointsAdded: "$addedpromotions.visitDates.pointsAdded",
          },
        },
      ]);

      console.log("📈 Agregación de puntos para cliente:", {
        email: client.email,
        numRegistros: pointsDaysAggregate.length,
        puntosTotal: pointsDaysAggregate.reduce((sum, entry) => sum + entry.pointsAdded, 0),
      });

      const visitsDaysAggregate = await Client.aggregate([
        { $match: { _id: client._id } },
        { $unwind: "$addedpromotions" },
        { $match: { "addedpromotions.promotion": { $in: accountPromotionIds } } },
        { $unwind: "$addedpromotions.visitDates" },
        {
          $match: {
            "addedpromotions.visitDates.date": { $exists: true, $type: "date" },
          },
        },
        {
          $project: {
            email: 1,
            date: { $dateToString: { format: "%Y-%m-%d", date: "$addedpromotions.visitDates.date" } },
          },
        },
      ]);

      console.log("🏃 Agregación de visitas para cliente:", {
        email: client.email,
        numVisitas: visitsDaysAggregate.length,
      });

      // Update total points
      totalPoints += pointsDaysAggregate.reduce((sum, entry) => sum + entry.pointsAdded, 0);

      // Update total visits
      totalVisits += visitsDaysAggregate.length;

      // Group data by client
      const clientVisits = visitsDaysAggregate.length;
      const clientPoints = pointsDaysAggregate.reduce((sum, entry) => sum + entry.pointsAdded, 0);

      // Sum up the redeemCount for all promotions
      const clientRedeemCount = client.addedpromotions.reduce((total, promo) => {
        return total + (promo.redeemCount || 0); // Add redeemCount if it exists, otherwise add 0
      }, 0);

      totalRedeemCount += clientRedeemCount;

      if (clientVisits > 0 || clientPoints > 0) {
        visitDataByClient.push({
          client: client.email,
          visits: clientVisits,
          points: clientPoints,
          redeemCount: clientRedeemCount,
          registrationDate,
        });

        pointDataByClient.push({
          client: client.email,
          points: clientPoints,
          redeemCount: clientRedeemCount,
          registrationDate,
        });
      }

      // Update dailyData for visits and points
      visitsDaysAggregate.forEach((entry) => {
        if (dailyData[entry.date]) {
          dailyData[entry.date].visits++;
        }
      });

      pointsDaysAggregate.forEach((entry) => {
        if (dailyData[entry.date]) {
          dailyData[entry.date].points += entry.pointsAdded;
        }
      });
    }

    // Total clients updated based on registration within the period
    totalClients = clients.filter((client) => {
      const registrationDate = moment(client.createdAt || client._id.getTimestamp());
      return registrationDate.isSameOrAfter(sevenDaysAgo);
    }).length;

    // Format and sort data
    const orderedDailyData = Object.entries(dailyData)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]))
      .map(([date, data]) => ({ date, ...data }));

    // Sort clients by total visits
    visitDataByClient.sort((a, b) => b.visits - a.visits);
    pointDataByClient.sort((a, b) => b.points - a.points);

    // Return the results
    res.status(200).json({
      totalClients,
      totalVisits,
      totalPoints,
      totalRedeemCount, // Update this if you track redeem counts
      totalPromotions,
      visitDataByClient,
      pointDataByClient,
      dailyData: orderedDailyData,
    });
  } catch (error) {
    console.error("❌ Error en getDashboardMetrics:", error);
    res.status(500).json({ message: "Error retrieving dashboard metrics" });
  }
};

>>>>>>> Stashed changes
const sendEmailWithQRCode = async (clientEmail, existingPromotiondata, clientid, existingPromotiondataid, promotionTitle) => {
  try {
    const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"; // Replace with your actual logo URL
    const msg = {
      to: clientEmail,
      from: "contacto@fidelidapp.cl",
      subject: "¡Has sido agregado a una promoción!",
      html: `
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
          </style>
        </head>
        <body>
          <div class="container">
            <div class="content">
<h1>¡Has sido agregado a una promoción!</h1>
<h1>${promotionTitle}</h1>
<p> ${existingPromotiondata.description}</h1>
${!existingPromotiondata.pointSystem ? `<p><strong>Visitas Requeridas:</strong> ${existingPromotiondata.visitsRequired}</p>` : ""}
<p>Verifica tu promoción haciendo clic en el siguiente enlace:</p>
<a href="${process.env.BASE_URL}/promotions/${clientid}/${existingPromotiondataid}" class="button">Ver Fidelicard</a>
<p>Y para validar tus visitas o sumar puntos, pide que te muestren el QR de la tienda. </p>
<p>Aplican Condiciones:</p>
<p>${existingPromotiondata.conditions}</p>
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
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
  }
};

const cron = require("node-cron");
const { time } = require("console");
const { register } = require("module");

cron.schedule("0 0 * * *", async () => {
  try {
    const currentDate = new Date();

    const expiredPromotions = await Promotion.find({
      $or: [
        { endDate: { $lt: currentDate }, status: { $ne: "Expirada" } },
        { promotionRecurrent: true, promotionDuration: { $lt: currentDate - new Date(promotion.createdAt) }, status: { $ne: "Expirada" } }, // Promociones recurrentes y vencidas
      ],
    });

    for (const promotion of expiredPromotions) {
      await Promotion.updateOne({ _id: promotion._id }, { $set: { status: "Expirada" } });

      if (promotion.systemType === "points") {
        for (const clientData of promotion.addedClients) {
          const client = await Client.findById(clientData.clientId);

          if (client) {
            const pointsToRemove = clientData.pointsEarned;
            await Client.updateOne({ _id: client._id }, { $inc: { totalPoints: -pointsToRemove } });
          }
        }
      }

      if (promotion.systemType === "visits") {
        for (const clientData of promotion.addedClients) {
          const client = await Client.findById(clientData.clientId);

          if (client) {
            if (clientData.redeemCount >= promotion.maxVisits) {
              await Client.updateOne({ _id: client._id, "addedpromotions.promotion": promotion._id }, { $set: { "addedpromotions.$.status": "Expirada" } });
            }
          }
        }
      }
    }

    console.log("Cron job ejecutado y promociones expiradas actualizadas.");
  } catch (error) {
    console.error("Error al ejecutar cron job:", error);
  }
});

exports.getPromotionRegistrations = async (req, res) => {
  try {
    const { accountId, startDate, endDate } = req.query;

    let query = {};

    if (accountId) {
      query.accountId = accountId;
    }

    if (startDate || endDate) {
      query.registrationDate = {};
      if (startDate) {
        query.registrationDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.registrationDate.$lte = new Date(endDate);
      }
    }

    const registrations = await PromotionRegistration.find(query)
      .sort({ registrationDate: -1 })
      .populate("promotionId", "title description")
      .populate("clientId", "name email phoneNumber");

    res.status(200).json({
      registrations,
      total: registrations.length,
    });
  } catch (error) {
    console.error("Error fetching promotion registrations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

<<<<<<< Updated upstream

exports.getDashboardMetrics = async (req, res) => {
  const timePeriod = req.body.timePeriod || 7;
  const startDate = moment().subtract(timePeriod, "days").startOf("day").toDate();

  try {
    const account = await Account.findOne({ userEmails: req.email }).populate("promotions");

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    console.log("Creating Report for Account:", account._id);

    const accountPromotionIds = account.promotions.map((id) => new mongoose.Types.ObjectId(id));
    console.log("Account Promotion IDs:", accountPromotionIds);

    // Execute the three queries
    const [dailyMetrics, globalMetrics, customerMetrics] = await Promise.all([
      getDailyMetrics(account._id, accountPromotionIds, startDate),
      getGlobalMetrics(account._id),
      getCustomerMetrics(account._id, accountPromotionIds),
    ]);

    console.log("Daily Metrics:", dailyMetrics);
    console.log("Global Metrics:", globalMetrics);

    // Initialize variables for response
    const dailyData = {};
    const visitDataByClient = [];
    const pointDataByClient = [];
    let totalVisits = 0;
    let totalPoints = 0;
    let totalRedeemCount = 0;

    // Prepare dailyData structure
    for (let i = 0; i < timePeriod; i++) {
      const date = moment().subtract(i, "days").format("YYYY-MM-DD");
      dailyData[date] = { date, visits: 0, points: 0, registrations: 0 };
    }

    // Populate dailyData with global metrics
    globalMetrics.forEach(({ _id: date, registrations }) => {
      if (dailyData[date]) {
        dailyData[date].registrations += registrations;
      }
    });

    // Populate dailyData with daily metrics
    dailyMetrics.forEach(({ _id: { date }, visits, points, redeems }) => {
      if (dailyData[date]) {
        dailyData[date].visits += visits;
        dailyData[date].points += points;
      }
      totalVisits += visits;
      totalPoints += points;
      totalRedeemCount += redeems;
    });

    // Prepare customer-level metrics for client-specific data
    customerMetrics.forEach(({ email, totalVisits, totalPoints, totalRedeems }) => {
      visitDataByClient.push({
        client: email,
        visits: totalVisits,
        points: totalPoints,
        redeemCount: totalRedeems,
      });

      pointDataByClient.push({
        client: email,
        points: totalPoints,
        redeemCount: totalRedeems,
      });
    });

    // Sort dailyData and client-level data
    const orderedDailyData = Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date));
    visitDataByClient.sort((a, b) => b.visits - a.visits);
    pointDataByClient.sort((a, b) => b.points - a.points);

    // Get total client count
    const totalClients = await Client.countDocuments({ "addedAccounts.accountId": account._id });
    const registeredClients = customerMetrics.length;

    // Final response
    res.status(200).json({
      totalClients,
      registeredClients,
      totalVisits,
      totalPoints,
      totalRedeemCount,
      totalPromotions: accountPromotionIds.length,
      visitDataByClient,
      pointDataByClient,
      dailyData: orderedDailyData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving dashboard metrics" });
  }
};


const getDailyMetrics = async (accountId, accountPromotionIds, startDate) => {
  return await Client.aggregate([
    { $match: { "addedAccounts.accountId": accountId } }, // Match by account
    { $unwind: "$addedpromotions" }, // Unwind promotions
    {
      $match: {
        "addedpromotions.promotion": { $in: accountPromotionIds }, // Filter by relevant promotions
      },
    },
    { $unwind: { path: "$addedpromotions.visitDates", preserveNullAndEmptyArrays: true } }, // Unwind visit dates
    {
      $match: {
        $or: [
          { "addedpromotions.visitDates.date": { $gte: startDate } }, // Include visits in the range
        ],
      },
    },
    {
      $group: {
        _id: {
          date: {
            $dateToString: { format: "%Y-%m-%d", date: { $ifNull: ["$addedpromotions.visitDates.date", { $toDate: "$_id" }] } },
          },
        }, // Group by date
        visits: { $sum: { $cond: [{ $ifNull: ["$addedpromotions.visitDates.date", false] }, 1, 0] } }, // Sum visits
        points: { $sum: "$addedpromotions.visitDates.pointsAdded" }, // Sum points
        redeems: { $sum: "$addedpromotions.redeemCount" }, // Sum redeems
        registrations: {
          $sum: {
            $cond: [
              { $gte: [{ $toDate: "$_id" }, startDate] }, // Check if registration date is in range
              1,
              0,
            ],
          },
        }, // Sum registrations
      },
    },
    { $sort: { "_id.date": 1 } }, // Sort by date
  ]);
};

const getGlobalMetrics = async (accountId) => {
  return await Client.aggregate([
    {
      $match: {
        "addedAccounts.accountId": accountId,
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$_id" } } }, // Group by day
        registrations: { $sum: 1 }, // Count registrations
      },
    },
    { $sort: { _id: 1 } }, // Sort by date
  ]);
};
const getCustomerMetrics = async (accountId, promotionIds) => {
  return Client.aggregate([
    { $match: { "addedAccounts.accountId": accountId } }, // Match clients by account
    { $unwind: "$addedpromotions" }, // Unwind promotions
    {
      $match: {
        "addedpromotions.promotion": { $in: promotionIds }, // Filter by relevant promotions
      },
    },
    { $unwind: { path: "$addedpromotions.visitDates", preserveNullAndEmptyArrays: true } }, // Unwind visitDates
    {
      $group: {
        _id: "$_id", // Group by client
        email: { $first: "$email" }, // Preserve client email
        totalVisits: {
          $sum: {
            $cond: [{ $ifNull: ["$addedpromotions.visitDates.date", false] }, 1, 0], // Count visits
          },
        },
        totalPoints: {
          $sum: {
            $add: [
              { $ifNull: ["$addedpromotions.pointsEarned", 0] }, // Sum pointsEarned
              { $ifNull: ["$addedpromotions.visitDates.pointsAdded", 0] }, // Sum visitDates.pointsAdded
            ],
          },
        },
        totalRedeems: { $sum: "$addedpromotions.redeemCount" }, // Sum redeems
      },
    },
  ]);
};

=======
exports.getWeeklyVisits = async (req, res) => {
  try {
    console.log("1. Iniciando getWeeklyVisits");
    console.log("Email recibido:", req.email);

    const email = req.email;
    const user = await User.findOne({ email });
    console.log("2. Usuario encontrado:", user ? "Sí" : "No");

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Obtener la fecha de hace una semana
    const oneWeekAgo = moment().subtract(7, "days").startOf("day").toDate();
    console.log("3. Fecha hace una semana:", oneWeekAgo);

    // Obtener todas las promociones del usuario
    const promotions = await Promotion.find({ userID: user._id });
    console.log("4. Número de promociones encontradas:", promotions.length);
    const promotionIds = promotions.map((promotion) => promotion._id);
    console.log("5. IDs de promociones:", promotionIds);

    // Buscar clientes con estas promociones
    const clients = await Client.aggregate([
      {
        $match: {
          "addedpromotions.promotion": { $in: promotionIds },
        },
      },
      {
        $unwind: "$addedpromotions",
      },
      {
        $match: {
          "addedpromotions.promotion": { $in: promotionIds },
        },
      },
      {
        $unwind: "$addedpromotions.visitDates",
      },
      {
        $match: {
          "addedpromotions.visitDates.date": {
            $gte: oneWeekAgo,
          },
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$addedpromotions.visitDates.date" } },
          },
          totalVisits: { $sum: 1 },
          uniqueClients: { $addToSet: "$_id" },
        },
      },
      {
        $sort: { "_id.date": 1 },
      },
    ]);

    console.log("6. Resultados de la agregación:", clients);

    // Preparar el objeto de respuesta
    const weeklyStats = {
      totalVisits: 0,
      uniqueClients: new Set(),
      dailyVisits: {},
    };

    // Inicializar los últimos 7 días con 0 visitas
    for (let i = 0; i < 7; i++) {
      const date = moment().subtract(i, "days").format("YYYY-MM-DD");
      weeklyStats.dailyVisits[date] = {
        visits: 0,
        uniqueClients: 0,
      };
    }

    console.log("7. Estructura inicial de weeklyStats:", weeklyStats);

    // Llenar con los datos reales
    clients.forEach((day) => {
      const date = day._id.date;
      if (weeklyStats.dailyVisits[date]) {
        weeklyStats.dailyVisits[date] = {
          visits: day.totalVisits,
          uniqueClients: day.uniqueClients.length,
        };
        weeklyStats.totalVisits += day.totalVisits;
        day.uniqueClients.forEach((clientId) => weeklyStats.uniqueClients.add(clientId.toString()));
      }
    });

    console.log("8. WeeklyStats después de procesar:", weeklyStats);

    // Convertir el resultado final
    const response = {
      totalVisits: weeklyStats.totalVisits,
      uniqueClients: weeklyStats.uniqueClients.size,
      dailyStats: Object.entries(weeklyStats.dailyVisits).map(([date, stats]) => ({
        date,
        visits: stats.visits,
        uniqueClients: stats.uniqueClients,
      })),
    };

    console.log("9. Respuesta final:", response);

    res.status(200).json(response);
  } catch (error) {
    console.error("Error en getWeeklyVisits:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};
>>>>>>> Stashed changes
