const jwt = require("jsonwebtoken");
const Promotion = require("./promotions.model");
const Client = require("./client.model");
const User = require("../auth/User.model");
const { Account } = require("../accounts/Account.model");
const sgMail = require("@sendgrid/mail");
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const qr = require("qrcode");
const fs = require("fs");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const { sendSSEMessageToClient } = require("../events/eventController.js");

const log = require("../logger/logger.js");
const { StrToObjectId } = require("../utils/StrToObjectId.js");

exports.createPromotion = async (req, res) => {
  try {
    let token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const user = await User.findOne({ email });
    console.log(user);

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const account = await Account.findOne({ userEmails: user.email });
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    console.log(req.body);

    const promotion = new Promotion({
      userID: account.owner,
      title: req.body.title,
      description: req.body.description,
      promotionType: req.body.promotionType,
      promotionRecurrent: req.body.promotionRecurrent,
      visitsRequired: req.body.visitsRequired,
      benefitDescription: req.body.benefitDescription,
      promotionDuration: req.body.promotionDuration,
      imageUrl: req.body.imageUrl,
      conditions: req.body.conditions,
    });

    await promotion.save();

    account.promotions.push(promotion._id);

    await account.save();

    log.logAction(email, "createPromotion", promotion.title);

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

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const promotions = await Promotion.find({ userID: user._id });

    const promotionIds = promotions.map((promotion) => promotion._id.toString());

    const clients = await Client.find({ "addedpromotions.promotion": { $in: promotionIds } });

    const totalVisitsCount = clients.reduce((sum, client) => {
      return (
        sum +
        (client.addedpromotions || [])
          .filter((promotion) => promotionIds.includes(promotion.promotion.toString())) // Ensure correct comparison of promotion IDs
          .reduce((subSum, promotion) => {
            return subSum + (promotion.visitDates ? promotion.visitDates.length : 0);
          }, 0)
      );
    }, 0);

    const redeemedGiftsCount = clients.reduce((sum, client) => {
      return (
        sum +
        (client.addedpromotions || [])
          .filter((promotion) => promotionIds.includes(promotion.promotion.toString())) // Ensure correct comparison of promotion IDs
          .reduce((subSum, promotion) => {
            return subSum + (typeof promotion.redeemCount === "number" ? promotion.redeemCount : 0);
          }, 0)
      );
    }, 0);

    res.status(200).json({
      promotions,
      metrics: {
        activePromotions: promotions.length,
        registeredClients: clients.length,
        totalVisits: totalVisitsCount,
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.name = decoded.name;
    req.email = decoded.email;
    req.userid = decoded.id;
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

    const clients = await Client.aggregate([
      { $match: { "addedpromotions.promotion": promotion._id } },
      {
        $project: {
          name: 1,
          email: 1,
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

    const visitDatesAggregate = await Client.aggregate([
      { $match: { "addedpromotions.promotion": promotion._id } },
      { $unwind: "$addedpromotions" },
      { $match: { "addedpromotions.promotion": promotion._id } },
      { $unwind: "$addedpromotions.visitDates" },
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

    const visitsPerDay = visitDatesAggregate.map((entry) => {
      const formattedDate = new Date(entry._id).toISOString().split("T")[0];
      return { date: formattedDate, visits: entry.visits };
    });

    const clientList = clients.map((client) => ({
      name: client.name,
      email: client.email,
      id: client._id,
      status: client.addedpromotions[0]?.status || "Unknown",
    }));

    const statistics = {
      TotalClients: clients.length,
      ActiveClients: clientList.filter((client) => client.status === "Active").length,
      ExpiredClients: clientList.filter((client) => client.status === "Expired").length,
      RedeemedClients: clientList.filter((client) => client.status === "Redeemed").length,
      TotalVisit: visitsPerDay.reduce((sum, entry) => sum + entry.visits, 0),
      visitsPerDay: visitsPerDay,
      clientList: clientList,
    };

    promotion.statistics = statistics;

    res.status(200).json({ promotion, accountId: promotion.accountId, accountLogo: account.logo, accountSocialMedia: account.socialMedia });
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
      return res.status(400).json({ error: "Client already has this promotion" });
    }

    client.addedpromotions.push({
      promotion: promotionId,
      addedDate: new Date(),
      endDate: new Date(Date.now() + existingPromotiondata.promotionDuration * 24 * 60 * 60 * 1000), // Duración en milisegundos
      status: "Active",
    });

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
          },
        ],
      });
    }
    await sendEmailWithQRCode(clientEmail, existingPromotiondata, client._id, existingPromotiondata._id, existingPromotiondata.title);
    await client.save();
    await account.save();

    log.logAction(clientEmail, "addclient", `Client ${clientEmail} added to promotion ${existingPromotiondata.title}`);

    res.status(201).json({ message: "Client added to promotion successfully", client });
  } catch (error) {
    console.error("Error adding client to promotion:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getClientPromotion = async (req, res) => {

  const clientId = req.params.cid;
  const promotionId = req.params.pid;

  try {
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    const promotion = client.addedpromotions.find((promotion) => promotion.promotion.toString() === promotionId);
    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found for this client" });
    }

    const promotionDetails = await Promotion.findById(promotionId);
    //.populate('imageID');

    // const imageUrl = `data:${promotionDetails.imageID.contentType};base64,${promotionDetails.imageID.data}`;

    //Check end date of promotion andcompare to current date
    const currentDate = new Date();
    const promotionEndDate = new Date(promotion.endDate);

    if (currentDate > promotionEndDate) {
      promotion.status = "Expired";
      client.addedpromotions.find((promotion) => promotion.promotion.toString() === promotionId).status = "Expired";
      await client.save();
    }

    // Create response from promotion and client
    const response = {
      promotion: promotion,
      promotionDetails: promotionDetails,
      client: client,
      //imageUrl: imageUrl
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

exports.redeemVisits = async (req, res) => {
  const { clientEmail, promotionId, accountQr } = req.body;

  console.log(clientEmail, promotionId, accountQr);

  if (!promotionId || !clientEmail || !accountQr) {
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

  if (account.accountQr !== accountQr) {
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
    promotion.visitDates.push(new Date());

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

    promotion.status = "Redeemed";
    promotion.redeemCount = (promotion.redeemCount || 0) + 1;
    await client.save();

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
    return res.status(400).json({ error: "Missing promotion ID or client email" });
  }

  try {
    // Find Existing Promotion in Promotion Model
    const existingPromotiondata = await Promotion.findById(promotionId);
    if (!existingPromotiondata) {
      return res.status(404).json({ error: "Promotion not found" });
    }

    // Find the client by email
    let client = await Client.findOne({ email: clientEmail });
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // // Extract email from token and validate that email exists in the account
    // const token = req.cookies.authToken; // Ensure this is where the token is stored
    // if (!token) {
    //   return res.status(401).json({ error: 'No token provided' });
    // }

    // const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // const email = decoded.email; // Assuming the user email is stored in the JWT payload

    // // Search account by existingPromotiondata.userID
    // const account = await Account.findOne({ owner: existingPromotiondata.userID });

    // if (!account) {
    //   return res.status(404).json({ error: 'Account not found' });
    // }

    // if (!account.userEmails.includes(email)) {
    //   return res.status(401).json({ error: 'Unauthorized user' });
    // }

    // Find the promotion in the client's addedpromotions array
    const promotion = client.addedpromotions.find((promotion) => promotion.promotion.toString() === promotionId);

    if (!promotion) {
      return res.status(404).json({ error: "Promotion not found for this client" });
    }

    //Validate if actual visists is equal to visits required
    // if (promotion.actualVisits !== existingPromotiondata.visitsRequired) {
    //   return res.status(400).json({ error: "Actual visits is not equal to visits required" });
    // }

    // Update the promotion data

    // Reset promotion details if the promotion is reccurent
    if (existingPromotiondata.promotionRecurrent) {
      promotion.status = "Active";
      promotion.actualVisits = 0;
      promotion.addedDate = new Date();
      promotion.endDate = new Date(Date.now() + existingPromotiondata.promotionDuration * 24 * 60 * 60 * 1000); // Add promotion duration in milliseconds
      promotion.lastRedeemDate = new Date();
    }

    // Save the updated client document
    await client.save();
    log.logAction(clientEmail, "restartPromotion", promotion.title);

    res.status(200).json({ message: "Promotion restarted successfully", client });
  } catch (error) {
    console.error("Error restarting promotion:", error);
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
              <p>Visitas Requeridas:</strong> ${existingPromotiondata.visitsRequired}</h1>
              <p>Verifica tu promoción haciendo clic en el siguiente enlace:</p>
              <a href="${process.env.BASE_URL}/promotions/${clientid}/${existingPromotiondataid}" class="button">Ver Fidelicard</a>
              <p>Y para validar tus visitas, pide que te muestren el QR de la tienda. </p>
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
