const jwt = require("jsonwebtoken");
const Promotion = require("./promotions.model");
const Client = require("./client.model");
const User = require("../auth/User.model");
const Account = require("../accounts/Account.model");
const Campaign = require("../campaigns/Campaign.model");
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

    let daysOfWeekNumbers = [];
    // Verifica que el valor sea una cadena válida
    if (typeof req.body.promotionRequirements.daysOfWeek === 'string') {
      // Convierte la cadena en un array de números
      daysOfWeekNumbers = req.body.promotionRequirements.daysOfWeek.split(',').map(Number).filter(day => !isNaN(day));
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
      startDate: req.body.systemType === "visits" ? req.body.promotionRequirements.startDate : null,
      endDate: req.body.systemType === "visits" ? req.body.promotionRequirements.endDate : null,
      daysOfWeek: req.body.systemType === "visits" ? daysOfWeekNumbers : [],
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
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Obtener promociones y métricas en una sola consulta usando agregación
    const [promotions, metrics] = await Promise.all([
      // Consulta de promociones
      Promotion.find({ userID: user._id }),

      //Atualizar status de promociones segun fecha de termino
      Promotion.updateMany({ endDate: { $lt: new Date() } }, { $set: { status: "inactive" } }),

      // Consulta de métricas usando agregación
      Client.aggregate([
        // Filtrar clientes que tienen promociones del usuario
        {
          $match: {
            "addedpromotions.promotion": {
              $in: (await Promotion.find({ userID: user._id }, "_id")).map((p) => p._id),
            },
          },
        },
        // Desarmar el array de promociones
        { $unwind: "$addedpromotions" },
        // Agrupar y calcular métricas
        {
          $group: {
            _id: null,
            registeredClients: { $addToSet: "$_id" }, // Contar clientes únicos
            totalVisits: {
              $sum: {
                $cond: {
                  if: { $isArray: "$addedpromotions.visitDates" },
                  then: { $size: "$addedpromotions.visitDates" },
                  else: 0,
                },
              },
            },
            totalPoints: {
              $sum: { $ifNull: ["$addedpromotions.pointsEarned", 0] },
            },
            redeemedGifts: {
              $sum: { $ifNull: ["$addedpromotions.redeemCount", 0] },
            },
          },
        },
      ]),
    ]);

    // Extraer métricas del resultado de la agregación
    const metricsData = metrics[0] || {
      registeredClients: [],
      totalVisits: 0,
      totalPoints: 0,
      redeemedGifts: 0,
    };

    // Responder con las promociones y métricas
    res.status(200).json({
      promotions,
      metrics: {
        activePromotions: promotions.length,
        registeredClients: metricsData.registeredClients.length,
        totalVisits: metricsData.totalVisits,
        totalPoints: metricsData.totalPoints,
        redeemedGifts: metricsData.redeemedGifts,
      },
    });
  } catch (error) {
    console.error("Error al obtener promociones:", error);
    res.status(500).json({ error: "Error interno del servidor" });
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

    // Check is promotion endDate is in the past and update the status
    if (promotion.endDate && promotion.endDate < Date.now()) {
      promotion.status = "inactive";
      await promotion.save();
    }
    console.log(promotion.endDate);
    console.log("Promotion status", promotion.status);

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
          $project: {
            date: {
              $cond: {
                if: { $eq: [{ $type: "$addedpromotions.visitDates" }, "date"] },
                then: "$addedpromotions.visitDates",
                else: "$addedpromotions.visitDates.date",
              },
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$date",
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
      clientName: clientName || "-",
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
  const cookieValue = JSON.stringify({ clientId, promotionId });

  res.cookie("clientData", cookieValue, {
    httpOnly: false,
    secure: true,
    sameSite: "None",
    domain: ".fidelidapp.cl",
    path: "/",
    expires: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
  });
};
exports.getClientPromotion = async (req, res) => {
  const clientId = req.params.cid;
  const promotionId = req.params.pid;

  try {
    // Encuentra al cliente por su ID
    const client = await Client.findById(clientId).populate("addedpromotions.promotion");
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    console.log("client")
    console.log(client)

    // Encuentra la promoción específica del cliente usando el promotionId
    const promotion = client.addedpromotions.find(
      (promo) => promo.promotion?._id?.toString() === promotionId
    );


    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found for this client" });
    }

    console.log("promotion")
    console.log(promotion)

    const account = await Account.find({
      promotions: promotion.promotion,
    });

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

    if (promotion.systemType === "points" && currentDate > promotionEndDate) {
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

    // Trae la lista de promociones que tiene el cliente en funcion de account[0].promotions
    console.log("account promotions", account[0].promotions);

    // Find the specific client with a matching clientId and promotions
    const reducedClientPromotions = client.addedpromotions
      .filter((clientPromo) => account[0].promotions.includes(clientPromo.promotion?._id))
      .map((promo) => {
        const {
          _id,
          status,
          actualVisits,
          pointsEarned,
          endDate,
          systemType
        } = promo;

        const {
          title,
          visitsRequired
        } = promo.promotion;

        return {
          id: _id,
          status,
          title,
          actualVisits,
          pointsEarned,
          visitsRequired,
          systemType,
          endDate,
        };
      });

    console.log("clientPromotions", reducedClientPromotions);

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
      clientPromotions: reducedClientPromotions
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
              <img src="${account.logo || "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"
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

exports.getDashboardMetrics = async (req, res) => {
  const timePeriod = req.body.timePeriod || 14;
  const startDate = moment().subtract(timePeriod, "days").startOf("day").toDate();

  try {
    // Fetch the account
    const account = await Account.findOne({ userEmails: req.email }).populate("promotions");

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    console.log("Creating Report for Account:", account.name);

    const accountPromotionIds = account.promotions.map((id) => new mongoose.Types.ObjectId(id));

    // Fetch metrics concurrently
    const [
      dailyMetrics,
      globalMetrics = {},
      customerMetrics,
      globalCampaignMetrics,
      dailyCampaignMetrics,
      campaignDetails,
    ] = await Promise.all([
      getDailyMetrics(account._id, accountPromotionIds, startDate),
      getGlobalMetrics(account._id, accountPromotionIds),
      getCustomerMetrics(account._id, accountPromotionIds),
      getGlobalCampaignMetrics(account._id),
      getDailyCampaignMetrics(account._id, startDate),
      getCampaignDetails(account._id),
    ]);

    console.log("Global Metrics:", globalMetrics);
    console.log("Daily Metrics:", dailyMetrics);
    console.log("Customer Metrics:", customerMetrics);
    console.log("Global Campaign Metrics:", globalCampaignMetrics);
    console.log("Daily Campaign Metrics:", dailyCampaignMetrics);
    console.log("Campaign Details:", campaignDetails);

    // Prepare dailyData structure
    const dailyData = {};
    for (let i = 0; i < timePeriod; i++) {
      const date = moment().subtract(i, "days").format("YYYY-MM-DD");
      dailyData[date] = {
        date,
        visits: 0,
        points: 0,
        registrations: 0,
        emailSent: 0,
        emailOpened: 0,
        emailClicked: 0,
      };
    }

    // Normalize and populate `dailyMetrics` data
    dailyMetrics.forEach((metric) => {
      const formattedDate = moment(metric.date).format("YYYY-MM-DD");
      if (dailyData[formattedDate]) {
        dailyData[formattedDate].visits += metric.visits || 0;
        dailyData[formattedDate].points += metric.points || 0;
        dailyData[formattedDate].registrations += metric.registrations || 0;
      }
    });

    // Normalize and populate `dailyCampaignMetrics` data
    dailyCampaignMetrics.forEach((metric) => {
      const formattedDate = moment(metric.date).format("YYYY-MM-DD");
      if (dailyData[formattedDate]) {
        dailyData[formattedDate].emailSent += metric.dailyEmailsSent || 0;
        dailyData[formattedDate].emailOpened += metric.dailyOpens || 0;
        dailyData[formattedDate].emailClicked += metric.dailyClicks || 0;
      }
    });

    // Prepare customer metrics
    const visitDataByClient = customerMetrics
      .map(({ email, totalVisits, totalPoints, totalRedeems }) => ({
        client: email,
        visits: totalVisits,
        points: totalPoints,
        redeemCount: totalRedeems,
      }))
      .sort((a, b) => b.visits - a.visits);

    const pointDataByClient = [...visitDataByClient].sort((a, b) => b.points - a.points);

    // Extract metrics safely from the first element of the globalMetrics array
    const globalMetricsData = globalMetrics[0] || {}; // Use the first element or an empty object
    const totalClients = globalMetricsData.totalClients || 0;
    const totalVisits = globalMetricsData.totalVisits || 0;
    const totalPoints = globalMetricsData.totalPoints || 0;
    const totalRedeemCount = globalMetricsData.totalRedeems || 0;

    // Calculate total accountClients by checking Client model added counts
    const accountClients =
      (await Client.countDocuments({
        "addedAccounts.accountId": account._id,
      })) || 0;

    // Calculate fidelidapp index, number of returning clients over the total clients
    const findex =
      totalClients > 0
        ? ((100 * visitDataByClient.filter((client) => client.visits > 1).length) / totalClients).toFixed(2)
        : 0;

    // Extract global email campaign metrics
    const globalCampaignMetricsData = globalCampaignMetrics[0] || {}; // Use the first element or an empty object
    const totalEmailsSent = globalCampaignMetricsData.totalEmailsSent || 0;
    const totalEmailOpens = globalCampaignMetricsData.totalOpens || 0;
    const totalEmailClicks = globalCampaignMetricsData.totalClicks || 0;
    const totalCampaigns = globalCampaignMetricsData.totalCampaigns || 0;

    // Format campaign details
    const formattedCampaignDetails = campaignDetails.map((campaign) => ({
      name: campaign.name,
      status: campaign.status,
      totalSent: campaign.totalSent,
      totalOpens: campaign.totalOpens,
      totalClicks: campaign.totalClicks,
    }));

    // Final response
    res.status(200).json({
      Name: account.name,
      findex,
      accountClients,
      totalCampaigns,
      totalPromotions: accountPromotionIds.length,
      totalClients,
      totalVisits,
      totalPoints,
      totalRedeemCount,
      totalEmailsSent,
      totalEmailOpens,
      totalEmailClicks,
      dailyData: Object.values(dailyData).sort((a, b) => new Date(a.date) - new Date(b.date)),
      visitDataByClient,
      pointDataByClient,
      campaigns: formattedCampaignDetails,
    });
  } catch (error) {
    console.error("Error retrieving dashboard metrics:", error.message);
    res.status(500).json({ message: "Error retrieving dashboard metrics" });
  }
};

const getDailyMetrics = async (accountId, accountPromotionIds, startDate) => {
  try {
    const [visitMetrics, registrationMetrics] = await Promise.all([
      getDailyMetricsVisits(accountPromotionIds, startDate),
      getDailyMetricsRegistrations(accountPromotionIds, startDate),
    ]);

    // Combine the two results into a single structure
    const combinedMetrics = {};

    // Add visits, points, and redeems to combinedMetrics
    visitMetrics.forEach(({ _id: { date }, visits, points, redeems }) => {
      combinedMetrics[date] = { date, visits, points, redeems, registrations: 0 };
    });

    // Add registrations to combinedMetrics
    registrationMetrics.forEach(({ _id: { date }, registrations }) => {
      if (!combinedMetrics[date]) {
        combinedMetrics[date] = { date, visits: 0, points: 0, redeems: 0, registrations };
      } else {
        combinedMetrics[date].registrations = registrations;
      }
    });

    // Convert to sorted array
    return Object.values(combinedMetrics).sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch (error) {
    console.error("Error retrieving daily metrics:", error);
    throw error;
  }
};

const getDailyMetricsVisits = async (accountPromotionIds, startDate) => {
  return await Client.aggregate([
    { $unwind: "$addedpromotions" }, // Unwind promotions
    {
      $match: {
        "addedpromotions.promotion": { $in: accountPromotionIds }, // Filter by relevant promotions
      },
    },
    { $unwind: { path: "$addedpromotions.visitDates", preserveNullAndEmptyArrays: true } }, // Unwind visit dates
    {
      $match: {
        "addedpromotions.visitDates.date": { $gte: startDate }, // Include visits in the range
      },
    },
    {
      $group: {
        _id: {
          date: {
            $dateToString: { format: "%Y-%m-%d", date: "$addedpromotions.visitDates.date" }, // Group by visit date
          },
        },
        visits: { $sum: 1 }, // Count visits
        points: { $sum: "$addedpromotions.visitDates.pointsAdded" }, // Sum points
        redeems: { $sum: "$addedpromotions.redeemCount" }, // Sum redeems
      },
    },
    { $sort: { "_id.date": 1 } }, // Sort by date
  ]);
};

const getDailyMetricsRegistrations = async (accountPromotionIds, startDate) => {
  return await Client.aggregate([
    {
      $addFields: {
        registrationDate: { $toDate: "$_id" }, // Extract the creation date from the Client ID
      },
    },
    {
      $match: {
        "addedpromotions.promotion": { $in: accountPromotionIds }, // Filter by relevant promotions
      },
    },
    {
      $match: {
        registrationDate: { $gte: startDate }, // Check if registration date is in range
      },
    },
    {
      $group: {
        _id: {
          date: {
            $dateToString: { format: "%Y-%m-%d", date: "$registrationDate" }, // Group by registration date
          },
        },
        registrations: { $sum: 1 }, // Count registrations
      },
    },
    { $sort: { "_id.date": 1 } }, // Sort by date
  ]);
};

const getGlobalMetrics = async (accountId, accountPromotionIds) => {
  return await Client.aggregate([
    // Unwind the addedpromotions array to process individual promotions
    {
      $unwind: {
        path: "$addedpromotions",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $match: {
        "addedpromotions.promotion": { $in: accountPromotionIds }, // Filter by relevant promotions
        "addedAccounts.accountId": accountId, // Ensure the account matches
      },
    },
    // Group to calculate global metrics
    {
      $group: {
        _id: "$_id", // Group by client to calculate per-client metrics
        visitDatesCount: {
          $sum: { $size: { $ifNull: ["$addedpromotions.visitDates", []] } }, // Count visitDates per promotion
        },
        totalPoints: { $sum: "$addedpromotions.pointsEarned" }, // Sum points earned
        totalRedeems: { $sum: "$addedpromotions.redeemCount" }, // Sum redeem count
      },
    },
    // Group again to calculate global metrics across all clients
    {
      $group: {
        _id: null,
        totalClients: { $sum: 1 }, // Count distinct clients
        totalVisits: { $sum: "$visitDatesCount" }, // Sum visit counts
        totalPoints: { $sum: "$totalPoints" }, // Sum total points across clients
        totalRedeems: { $sum: "$totalRedeems" }, // Sum total redeems across clients
      },
    },
    // Project to format the output
    {
      $project: {
        _id: 0, // Exclude the _id field
        totalClients: 1,
        totalPoints: 1,
        totalVisits: 1,
        totalRedeems: 1,
      },
    },
  ]);
};

const getCustomerMetrics = async (accountId, promotionIds) => {
  // Query for total visits
  const visits = await Client.aggregate([
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
          $sum: { $cond: [{ $ifNull: ["$addedpromotions.visitDates.date", false] }, 1, 0] }, // Count visits
        },
      },
    },
  ]);

  // Query for total points
  const points = await Client.aggregate([
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
        totalPoints: {
          $sum: {
            $add: [
              { $ifNull: ["$addedpromotions.visitDates.pointsAdded", 0] }, // Sum visitDates.pointsAdded
            ],
          },
        },
      },
    },
  ]);

  // Query for total redeems
  const redeems = await Client.aggregate([
    { $unwind: "$addedpromotions" }, // Unwind promotions
    {
      $match: {
        "addedpromotions.promotion": { $in: promotionIds }, // Filter by relevant promotions
      },
    },
    {
      $group: {
        _id: "$_id", // Group by client
        email: { $first: "$email" }, // Preserve client email
        totalRedeems: { $sum: "$addedpromotions.redeemCount" }, // Sum redeems
      },
    },
  ]);

  // Merge results into a single array of customer metrics
  const mergedMetrics = {};

  // Merge visits
  visits.forEach(({ _id, email, totalVisits }) => {
    if (!mergedMetrics[_id]) mergedMetrics[_id] = { _id, email, totalVisits: 0, totalPoints: 0, totalRedeems: 0 };
    mergedMetrics[_id].totalVisits = totalVisits;
  });

  // Merge points
  points.forEach(({ _id, email, totalPoints }) => {
    if (!mergedMetrics[_id]) mergedMetrics[_id] = { _id, email, totalVisits: 0, totalPoints: 0, totalRedeems: 0 };
    mergedMetrics[_id].totalPoints = totalPoints;
  });

  // Merge redeems
  redeems.forEach(({ _id, email, totalRedeems }) => {
    if (!mergedMetrics[_id]) mergedMetrics[_id] = { _id, email, totalVisits: 0, totalPoints: 0, totalRedeems: 0 };
    mergedMetrics[_id].totalRedeems = totalRedeems;
  });

  // Convert mergedMetrics object to an array
  return Object.values(mergedMetrics);
};

const getGlobalCampaignMetrics = async (accountId) => {
  return await Campaign.aggregate([
    {
      $match: { accountId }, // Filter campaigns by accountId
    },
    {
      $group: {
        _id: null,
        totalEmailsSent: { $sum: "$metrics.totalSent" },
        totalOpens: { $sum: "$metrics.opens" },
        totalClicks: { $sum: "$metrics.clicks" },
        totalCampaigns: { $sum: 1 }, // Count the total number of campaigns
      },
    },
    {
      $project: {
        _id: 0,
        totalEmailsSent: 1,
        totalOpens: 1,
        totalClicks: 1,
        totalCampaigns: 1, // Include totalCampaigns in the projection
      },
    },
  ]);
};

const getDailyCampaignMetrics = async (accountId, startDate) => {
  return await Campaign.aggregate([
    {
      $match: {
        accountId,
        startDate: { $gte: startDate }, // Filter campaigns by startDate
      },
    },
    {
      $project: {
        date: { $dateToString: { format: "%Y-%m-%d", date: "$startDate" } }, // Format date
        metrics: 1,
      },
    },
    {
      $group: {
        _id: "$date", // Group by date
        dailyEmailsSent: { $sum: "$metrics.totalSent" },
        dailyOpens: { $sum: "$metrics.opens" },
        dailyClicks: { $sum: "$metrics.clicks" },
      },
    },
    {
      $sort: { _id: 1 }, // Sort by date
    },
    {
      $project: {
        date: "$_id", // Rename _id to date for readability
        dailyEmailsSent: 1,
        dailyOpens: 1,
        dailyClicks: 1,
      },
    },
  ]);
};

const getCampaignDetails = async (accountId) => {
  return await Campaign.aggregate([
    {
      $match: { accountId }, // Filter campaigns by accountId
    },
    {
      $project: {
        name: 1,
        status: 1,
        totalSent: "$metrics.totalSent",
        totalOpens: "$metrics.opens",
        totalClicks: "$metrics.clicks",
      },
    },
  ]);
};