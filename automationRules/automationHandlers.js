const Client = require("../promotions/client.model");
const Promotion = require("../promotions/promotions.model");
const { sendMarketingEmail, sendAutomatedEmail } = require("../utils/emailSender"); // Ejemplo de servicio de correo
const mongoose = require("mongoose");
const log = require("../logger/logger.js");


// OLD Handler para clientes inactivos
// async function handleClientInactivity(rule) {
//   const { account, conditionValue, subject, message } = rule;
//   console.log("Executing client inactivity rule:", rule.name);
//   const emailText = `${message} <br> <br> <br> <img src="${account.logo}" height="100"></img>`;

//   // Calculate the inactivity threshold date
//   const inactivityThreshold = new Date(Date.now() - conditionValue * 24 * 60 * 60 * 1000);

//   // Extract client IDs from the account
//   const clientIds = account.clients.map((client) => client.id);

//   // Fetch client data using the extracted IDs
//   const clients = await Client.find({ _id: { $in: clientIds } });

//   if (!clients || clients.length === 0) {
//     console.log("No clients found for this account.");
//     return;
//   }
//   const accountPromotionIds = account.promotions.map((id) => new mongoose.Types.ObjectId(id)); // Convertir a ObjectId

//   for (const client of clients) {
//     const visitDaysAggregate = await Client.aggregate([
//       { $match: { _id: client._id } }, // Filtrar por el cliente actual
//       { $unwind: "$addedpromotions" },
//       {
//         $match: {
//           "addedpromotions.promotion": { $in: accountPromotionIds }, // Validar las promociones
//         },
//       },
//       { $unwind: "$addedpromotions.visitDates" },
//       {
//         $match: {
//           "addedpromotions.visitDates.date": { $exists: true, $type: "date" },
//         },
//       },
//       {
//         $group: {
//           _id: {
//             $dateToString: { format: "%Y-%m-%d", date: "$addedpromotions.visitDates.date" },
//           },
//         },
//       },
//       { $sort: { _id: 1 } },
//     ]);

//     const fechas = visitDaysAggregate.map((day) => day._id);

//     // Encontrar la fecha más reciente
//     const lastVisitDay = fechas[fechas.length - 1]; // Ya está en formato YYYY-MM-DD
//     const thresholdDay = inactivityThreshold.toISOString().split("T")[0];

//     //console.log(client.email);
//     //console.log(fechas);
//     //console.log("Last visit day:", lastVisitDay);
//     //console.log("Threshold day:", thresholdDay);

//     // Verificar si la última visita coincide con el umbral de inactividad
//     if (lastVisitDay === thresholdDay) {
//       try {
//         sendMarketingEmail({
//           to: client.email,
//           subject: subject,
//           text: emailText,
//         });

//         console.log("Automated handleClientInactivity Email sent to " + client.email);
//       } catch (error) {
//         console.error("Error sending email to" + client.email + error);
//       }
//     }
//   }
// }

// OLD Handler para promociones por expirar REVISAR POST CAMBIO DE VISIT DATES ?
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

// Handler para clientes nuevos y explica como funciona el programa, es de una unica vez, se podria mejorar ahora que toma HTML el handleRegistrationDate controller
async function handleclientRegistration(rule) {
  const { account, conditionValue, subject, message } = rule;
  console.log("Executing client registration rule:", rule.name);
  const emailText = `<p>${message}</p>
    <div class="content">
      <img src="https://storage.googleapis.com/fapp_promotion_images/Fidelidapp%20How%20To.png" alt="Fidelidapp How To Guide" style="max-width: 100%; height: auto; display: block; margin: 20px auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"/>
      <p>Si tienes alguna duda, puedes contactarnos a contacto@fidelidapp.cl</p>
    </div> 
      <img src="${account.logo}" height="100"></img>`;

  // Calculate the registration threshold date
  const registrationThreshold = new Date(Date.now() - conditionValue * 24 * 60 * 60 * 1000);
  console.log("Registration Threshold:", registrationThreshold.toISOString().split("T")[0]);

  // Extract client IDs from the account
  const clientIds = account.clients.map((client) => client.id);
  //console.log("Client IDs:", clientIds);

  // Fetch client data using the extracted IDs
  const clients = await Client.find({ _id: { $in: clientIds } });

  if (!clients || clients.length === 0) {
    console.log("No clients found for this account.");
    return;
  }

  for (const client of clients) {
  //  console.log("Client:", client.email);
    // Iterate over added accounts to check registration date
    for (const addedAccount of client.addedAccounts) {
      // Check if the accountId matches and the registration date is older than the threshold
      if (addedAccount.accountId.toString() === account._id.toString()) {
        const registrationDate = addedAccount._id.getTimestamp(); // Get timestamp from the ObjectId
        //console.log("Registration Date:", registrationDate.toISOString().split("T")[0]);

        // Compare only the date part (ignoring time)
        if (registrationDate.toISOString().split("T")[0] === registrationThreshold.toISOString().split("T")[0]) {
          try {
            // Replace {nombreCliente} in the message with the actual client name
            const personalizedMessage = emailText.replace("{nombreCliente}", client.name);
            console.log(`Sending email to ${client.email}: ${personalizedMessage}`);

            // Send marketing email
            sendMarketingEmail({
              to: client.email,
              subject: subject,
              text: personalizedMessage,
            });

            console.log("Automated handleClientRegistration Email sent to " + client.email);
            log.logAction(client.email, "handleclientRegistration", "Enviado Email desde account: " + account.name , "automations");
          } catch (error) {
            console.error("Error sending email to " + client.email + error);
          }
        }
      }
    }
  }
}

// Handler para recordatorio despues de la fecha de registro
async function handleRegistrationDate(rule) {
  const { account, conditionValue, subject, message } = rule;
  console.log("Executing client inactivity rule:", rule.name);

  // Calculate the registration threshold date
  const registrationThreshold = new Date(Date.now() - conditionValue * 24 * 60 * 60 * 1000);
  console.log("Registration Threshold:", registrationThreshold.toISOString().split("T")[0]);

  // Extract client IDs from the account
  const clientIds = account.clients.map((client) => client.id);
  //console.log("Client IDs:", clientIds);

  // Fetch client data using the extracted IDs
  const clients = await Client.find({ _id: { $in: clientIds } });

  if (!clients || clients.length === 0) {
    console.log("No clients found for this account.");
    return;
  }

  for (const client of clients) {
    // Iterate over added accounts to check registration date
    for (const addedAccount of client.addedAccounts) {
      // Check if the accountId matches and the registration date is older than the threshold
      if (addedAccount.accountId.toString() === account._id.toString()) {
        const registrationDate = addedAccount._id.getTimestamp(); // Get timestamp from the ObjectId
        console.log("Client:", client.email);
        console.log("Registration Date:", registrationDate.toISOString().split("T")[0]);

        // Compare only the date part (ignoring time)
        if (registrationDate.toISOString().split("T")[0] === registrationThreshold.toISOString().split("T")[0]) {
          try {
            // Replace {nombreCliente} in the message with the actual client name
            const personalizedMessage = message.replace("{nombreCliente}", client.name);
            //console.log(`Sending email to ${client.email}: ${personalizedMessage}`);
            // Send marketing email
            sendAutomatedEmail({
              to: client.email,
              subject: subject,
              html: personalizedMessage,
            });

            console.log("Automated handleRegistrationDate Email sent to " + client.email);
            log.logAction(client.email, "handleRegistrationDate", "Enviado Email desde cuenta: " + account.name , "automations");
          } catch (error) {
            console.error("Error sending email to " + client.email + error);
          }
        }
      }
    }
  }
}

module.exports = {
  handleRegistrationDate,
  handlePromotionExpiration,
  handleclientRegistration
};
