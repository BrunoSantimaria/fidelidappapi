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
const moment = require('moment');

exports.createPromotion = async (req, res) => {
  try {
    const { email, systemType } = req.body;
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

    console.log("Usuario encontrado:", user);

    // Obtener promociones del usuario
    const promotions = await Promotion.find({ userID: user._id });

    // Obtener los IDs de promociones
    const promotionIds = promotions.map((promotion) => promotion._id.toString());

    console.log("Promociones encontradas:", promotions);

    // Buscar clientes con promociones asociadas a los IDs de promoción del usuario
    const clients = await Client.find({ "addedpromotions.promotion": { $in: promotionIds } });

    console.log("Clientes encontrados:", clients);

    // Calcular métricas
    let totalVisitsCount = 0;
    let totalPointsCount = 0;
    let redeemedGiftsCount = 0;

    // Calcular métricas de visitas, puntos y redenciones
    clients.forEach((client) => {
      (client.addedpromotions || []).forEach((promotionEntry) => {
        console.log("Promoción del cliente:", promotionEntry);
        console.log("VisitDates de la promoción:", promotionEntry.visitDates); // Verifica el contenido de visitDates

        if (promotionIds.includes(promotionEntry.promotion.toString())) {
          console.log("La promoción es del usuario");

          const promotionDetails = promotions.find((promo) => promo._id.toString() === promotionEntry.promotion.toString());
          if (promotionDetails) {
            // Verificación adicional de tipo de sistema
            if (promotionDetails.systemType === "points") {
              totalPointsCount += promotionEntry.pointsEarned || 0;
              console.log("Puntos acumulados:", promotionEntry.pointsEarned);
            }
            redeemedGiftsCount += typeof promotionEntry.redeemCount === "number" ? promotionEntry.redeemCount : 0;
          }

          // Revisa y suma la cantidad de fechas de visita
          if (Array.isArray(promotionEntry.visitDates)) {
            totalVisitsCount += promotionEntry.visitDates.length;
            console.log("Visitas acumuladas:", promotionEntry.visitDates.length);
          } else {
            console.warn("visitDates no es un array en esta promoción:", promotionEntry);
          }
        }
      });
    });
    console.log("Total de puntos:", totalPointsCount);
    console.log("Total de visitas:", totalVisitsCount);

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
        id: client._id,
        totalPoints: client.totalPoints,
        totalVisits: client.totalVisits,
        status: client.addedpromotions[0]?.status || "Unknown",
      };
    });

    // Agregar estadísticas basadas en el systemType
    if (promotion.systemType === "visits") {
      // Agregar estadísticas de visitas por día
      const visitDatesAggregate = await Client.aggregate([
        { $match: { "addedpromotions.promotion": promotion._id } },
        { $unwind: "$addedpromotions" },
        { $match: { "addedpromotions.promotion": promotion._id } },
        { $unwind: "$addedpromotions.visitDates" },
        {
          $match: {
            "addedpromotions.visitDates": { $type: "date" }, // Solo fechas válidas para visitas
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$addedpromotions.visitDates" },
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
      // Agregar estadísticas de puntos por día
      const pointsPerDayAggregate = await Client.aggregate([
        { $match: { "addedpromotions.promotion": promotion._id } },
        { $unwind: "$addedpromotions" },
        { $match: { "addedpromotions.promotion": promotion._id } },
        { $unwind: "$addedpromotions.visitDates" },
        {
          $match: {
            "addedpromotions.visitDates.date": { $exists: true, $type: "date" }, // Asegurar que date existe y es Date
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$addedpromotions.visitDates.date" },
            },
            points: { $sum: "$addedpromotions.visitDates.pointsAdded" },
          },
        },
        { $sort: { _id: 1 } },
      ]);


      pointsPerDay = pointsPerDayAggregate.map((entry) => ({
        date: entry._id,
        points: entry.points,
      }));
    }

    console.log(clients)

    const clientList = clients.map((client) => ({
      name: client.name,
      email: client.email,
      phoneNumber: client.phoneNumber,
      id: client._id,
      status: client.addedpromotions[0]?.status || "Unknown",
    }));


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
      setClientIdCookie(res, client._id.toString(),promotionId)
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
    setClientIdCookie(res, client._id.toString(),promotionId);

    log.logAction(clientEmail, "addclient", `Client ${clientEmail} added to promotion ${existingPromotiondata.title}`);

    res.status(201).json({ message: "Client added to promotion successfully", client });
  } catch (error) {
    console.error("Error adding client to promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const setClientIdCookie = async (res, clientId, promotionId) => {
  // **Establecer la cookie para clientId**
  res.cookie('clientId', clientId, {
    path: `/promotion/${promotionId}`, // Hacerla específica para esta promoción
    expires: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000), // 10 años en milisegundos
    
    //Comentar los siguientes parametros en DEV para que funcione
    sameSite: 'None', // Previene el envío de cookies en solicitudes de terceros
    secure: true, // Solo en HTTPS
    domain: "fidelidapp.cl", // Replace with your domain
  });

}

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
  const { clientEmail, promotionId, accountQr } = req.body;

  console.log(clientEmail, promotionId, accountQr);

  if (!accountQr) {
    return res.status(400).json({ error: "Missing promotion ID or client email or AccountQR" });
  }

  const existingPromotiondata = await Promotion.findById(promotionId);

  if (!existingPromotiondata) {
    return res.status(404).json({ error: "Promotion not found" });
  }

  const account = await Account.findOne({ owner: existingPromotiondata.userID._id });

  if (!account) {
    return res.status(404).json({ error: "Associated account not found" });
  }
  console.log(account.accountQr, accountQr);

  if (account.accountQr != accountQr) {
    return res.status(401).json({ error: "Invalid daily key" });
  }

  let client = await Client.findOne({ email: clientEmail });
  if (!client) {
    return res.status(404).json({ error: "Client not found" });
  }

  try {
    const promotion = client.addedpromotions.find((promotion) => promotion.promotion.toString() === promotionId);

    console.log("Client Card Promotion:", promotion);

    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found for this client" });
    }

    if (promotion.status === "Completed") {
      return res.status(400).json({ error: "Promotion already completed" });
    }

    if (promotion.status === "Redeemed" || promotion.status === "Expired") {
      return res.status(400).json({ error: "Promotion already " + promotion.status });
    }

    // Check if date is expired
    if (promotion.endDate < new Date()) {
      promotion.status = "Expired";
      await client.save();
      return res.status(400).json({ error: "Promotion already expired" });
    }

    if (promotion.visitDates.some((date) => date.toDateString() === new Date().toDateString())) {
      return res.status(400).json({ error: "Promotion already added today" });
    }

    // Update the visits data
    promotion.actualVisits += 1;
    promotion.visitDates.push({ date: new Date() });

    console.log("Promotion:", promotion);

    if (promotion.actualVisits >= existingPromotiondata.visitsRequired) {
      promotion.status = "Pending";

      const qrLink = `${process.env.BASE_URL}/redeem-promotion/${client._id}/${promotionId}`;

      const qrCodeBuffer = await QRCode.toBuffer(qrLink);

      await sendCompletedPromotionMail(clientEmail, existingPromotiondata, client._id, existingPromotiondata._id, existingPromotiondata.title, qrCodeBuffer);

      await client.save();
      log.logAction(clientEmail, "redeemVisits", promotion.title);
      res.status(200).json({ message: "Promotion completed, QR generated", qrCode: qrCodeBuffer.toString("base64"), promotion });
    } else {
      await client.save();
      log.logAction(clientEmail, "redeemVisits", promotion.title);
      res.status(200).json({ message: "Visits redeemed successfully", client });
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
              <h1>¡Hola ${client.name}!</h1>
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


exports.getDashboardMetrics = async (req, res) => {
  try {
    // Fetch account using email
    const account = await Account.findOne({ userEmails: req.email }).populate('promotions');
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Retrieve all clients associated with this account
    const clients = await Client.find({ 'addedAccounts.accountId': account._id });

    // Filter promotions based on account
    const filteredClients = clients.map(client => {
      client.addedpromotions = client.addedpromotions.filter(promotion =>
        account.promotions.some(accPromotion => accPromotion._id.toString() === promotion.promotion.toString())
      );
      return client;
    });

    let totalVisits = 0;
    let totalRedeemCount = 0;
    let activeClientsCount = 0;
    const uniquePromotions = new Set();
    const visitDataByClient = [];
    const visitDataByPromotion = {};

    const sevenDaysAgo = moment().subtract(7, 'days').startOf('day');
    const dailyData = {};

    // Initialize daily data structure for the past 7 days
    for (let i = 0; i < 7; i++) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
      dailyData[date] = { registrations: 0, visits: 0, redeems: 0 };
    }

    filteredClients.forEach(client => {
      let clientVisits = 0;
      let clientRedeems = 0;

      // Register client registration date for the daily count
      const registrationDate = moment(client.createdAt || client._id.getTimestamp()).format('YYYY-MM-DD');
      if (registrationDate in dailyData) dailyData[registrationDate].registrations++;

      client.addedpromotions.forEach(promotion => {
        // Filter and count recent visits
        const recentVisits = promotion.visitDates.filter(date => date >= sevenDaysAgo).map(date => moment(date).format('YYYY-MM-DD'));

        recentVisits.forEach(date => {
          if (dailyData[date]) dailyData[date].visits++;
        });

        const recentRedeems = promotion.redeemCount;
        totalVisits += recentVisits.length;
        totalRedeemCount += recentRedeems;
        uniquePromotions.add(promotion.promotion.toString());

        clientVisits += recentVisits.length;
        clientRedeems += recentRedeems;

        // Track visits and redemptions by promotion for table
        if (!visitDataByPromotion[promotion.promotion]) {
          visitDataByPromotion[promotion.promotion] = { visits: 0, redeems: 0 };
        }
        visitDataByPromotion[promotion.promotion].visits += recentVisits.length;
        visitDataByPromotion[promotion.promotion].redeems += recentRedeems;
      });

      if (clientVisits > 0) activeClientsCount++;
      visitDataByClient.push({ client: client.email, visits: clientVisits, redeems: clientRedeems });
    });

    const totalClients = filteredClients.length;
    const promotionsAvailable = uniquePromotions.size;
    const visitFrequency = activeClientsCount > 0 ? parseFloat((totalVisits / activeClientsCount).toFixed(2)) : 0;
    const redemptionFrequency = activeClientsCount > 0 ? parseFloat((totalRedeemCount / activeClientsCount).toFixed(2)) : 0;

    //Ordenar data

    const orderedDailyData = await Object.fromEntries(
      Object.entries(dailyData)
        //Sort the dara in asciending order
        .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    );

    //Sort the data in descenging order visitDataByClient,visitDataByPromotion,

    visitDataByClient.sort((a, b) => b.visits - a.visits);

    res.status(200).json({
      totalClients,
      totalVisits,
      promotionsRedeemed: totalRedeemCount,
      promotionsAvailable,
      visitFrequency,
      redemptionFrequency,
      visitDataByClient,
      visitDataByPromotion,
      dailyData: orderedDailyData,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving dashboard metrics" });
  }
};

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
