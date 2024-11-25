const Client = require("../promotions/client.model");
const Promotion = require("../promotions/promotions.model");
const { sendMarketingEmail } = require("../utils/emailSender"); // Ejemplo de servicio de correo

// Handler para clientes inactivos
async function handleClientInactivity(rule) {
  const { account, conditionValue, subject, message } = rule;
  console.log("Executing client inactivity rule:", rule.name);
  const emailText = `${message} <br> <br> <br> <img src="${account.logo}" height="100"></img>`;

  // Calculate the inactivity threshold date
  const inactivityThreshold = new Date(Date.now() - conditionValue * 24 * 60 * 60 * 1000);

  // Extract client IDs from the account
  const clientIds = account.clients.map((client) => client.id);

  // Fetch client data using the extracted IDs
  const clients = await Client.find({ _id: { $in: clientIds } });

  if (!clients || clients.length === 0) {
    console.log("No clients found for this account.");
    return;
  }
  const accountPromotionIds = account.promotions.map((id) => new mongoose.Types.ObjectId(id)); // Convertir a ObjectId

  for (const client of clients) {
    const visitDaysAggregate = await Client.aggregate([
      { $match: { _id: client._id } }, // Filtrar por el cliente actual
      { $unwind: "$addedpromotions" },
      {
        $match: {
          "addedpromotions.promotion": { $in: accountPromotionIds }, // Validar las promociones
        },
      },
      { $unwind: "$addedpromotions.visitDates" },
      {
        $match: {
          "addedpromotions.visitDates.date": { $exists: true, $type: "date" },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$addedpromotions.visitDates.date" },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const fechas = visitDaysAggregate.map((day) => day._id);

    // Encontrar la fecha más reciente
    const lastVisitDay = fechas[fechas.length - 1]; // Ya está en formato YYYY-MM-DD
    const thresholdDay = inactivityThreshold.toISOString().split("T")[0];

    console.log(client.email);
    console.log(fechas);
    console.log("Last visit day:", lastVisitDay);
    console.log("Threshold day:", thresholdDay);

    // Verificar si la última visita coincide con el umbral de inactividad
    if (lastVisitDay === thresholdDay) {
      try {
        sendMarketingEmail({
          to: client.email,
          subject: subject,
          text: emailText,
        });

        console.log("Automated handleClientInactivity Email sent to " + client.email);
      } catch (error) {
        console.error("Error sending email to" + client.email + error);
      }
    }
  }
}

// Handler para promociones por expirar REVISAR POST CAMBIO DE VISIT DATES ?
async function handlePromotionExpiration(rule) {
  const { account, conditionValue, subject, message } = rule;
  console.log("Executing promotion expiration rule:", rule.name);

  // Calculate the expiration threshold date
  const expirationThreshold = new Date(Date.now() + conditionValue * 24 * 60 * 60 * 1000);

  // Extract client IDs from the account
  const clientIds = account.clients.map((client) => client.id);

  // Fetch client data using the extracted IDs
  const clients = await Client.find({ _id: { $in: clientIds } });

  if (!clients || clients.length === 0) {
    console.log("No clients found for this account.");
    return;
  }

  // Iterate over each client to check their promotions
  for (const client of clients) {
    // Gather all active promotions
    const activePromotions = client.addedpromotions.filter((promo) => promo.status === "Active");

    // Check for promotions nearing expiration
    for (const promo of activePromotions) {
      const promoEndDate = new Date(promo.endDate);

      // Extract the date parts for comparison (YYYY-MM-DD)
      const promoEndDay = promoEndDate.toISOString().split("T")[0];
      const thresholdDay = expirationThreshold.toISOString().split("T")[0];

      // Check if the promotion end day is the same as the expiration threshold day
      if (promoEndDay === thresholdDay) {
        try {
          const promotionName = await Promotion.findById(promo.promotion);
          emailText = `${message} <br> <br> Nombre de la promoción: ${promotionName.title} <br> <br> Fecha de Expiración: ${promoEndDay} <br> <br> <img src="${account.logo}" height="100"></img>`;

          sendMarketingEmail({
            to: client.email,
            subject: subject,
            text: emailText,
          });

          console.log(`Automated handlePromotionExpiration Email sent to ${client.email}`);
        } catch (error) {
          console.error(`Error sending email to ${client.email}: ${error}`);
        }
      }
    }
  }
}

module.exports = {
  handleClientInactivity,
  handlePromotionExpiration,
};
