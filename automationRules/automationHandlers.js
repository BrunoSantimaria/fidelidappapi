const Client = require('../promotions/client.model');
const Promotion = require('../promotions/promotions.model');
const { sendMarketingEmail } = require('../utils/emailSender'); // Ejemplo de servicio de correo

// Handler para clientes inactivos
async function handleClientInactivity(rule) {

    const { account, actionDetails, conditionValue } = rule;
    console.log('Executing client inactivity rule:', rule.name);

    emailText = `${actionDetails.message} <br> <br> <br> <img src="${account.logo}" height="100"></img>`

    // Calculate the inactivity threshold date
    const inactivityThreshold = new Date(Date.now() - conditionValue * 24 * 60 * 60 * 1000);

    // Extract client IDs from the account
    const clientIds = account.clients.map(client => client.id);

    // Fetch client data using the extracted IDs
    const clients = await Client.find({ _id: { $in: clientIds } });

    if (!clients || clients.length === 0) {
        console.log("No clients found for this account.");
        return;
    }

    // Iterate over each client to check their last visit date
    for (const client of clients) {
        // Gather all visit dates from all added promotions
        const visitDates = client.addedpromotions.flatMap(promo => promo.visitDates || []);

        // Determine if there are no visit dates
        if (visitDates.length === 0) {
            inactiveClients.push(client); // No visits recorded, consider inactive
            continue;
        }

        // Find the most recent visit date
        const lastVisitDate = new Date(Math.max(...visitDates.map(date => new Date(date).getTime())));

        // Extract the date parts for comparison (YYYY-MM-DD)
        const lastVisitDay = lastVisitDate.toISOString().split('T')[0];
        const thresholdDay = inactivityThreshold.toISOString().split('T')[0];

        // Check if the last visit day is the same as the inactivity threshold day
        if (lastVisitDay === thresholdDay) {
            try {
                sendMarketingEmail({
                    to: client.email,
                    subject: actionDetails.subject,
                    ...(actionDetails.header ? { header: actionDetails.header } : {}),
                    text: emailText
                });

                console.log(`Automated handleClientInactivity Email sent to ${client.email}`);
            } catch (error) {
                console.error(`Error sending email to ${client.email}: ${error}`);
            }
        }
    }

}

// Handler para promociones por expirar
async function handlePromotionExpiration(rule) {
    const { account, actionDetails, conditionValue } = rule;
    console.log('Executing promotion expiration rule:', rule.name);

    // Calculate the expiration threshold date
    const expirationThreshold = new Date(Date.now() + conditionValue * 24 * 60 * 60 * 1000);

    // Extract client IDs from the account
    const clientIds = account.clients.map(client => client.id);

    // Fetch client data using the extracted IDs
    const clients = await Client.find({ _id: { $in: clientIds } });

    if (!clients || clients.length === 0) {
        console.log("No clients found for this account.");
        return;
    }

    // Iterate over each client to check their promotions
    for (const client of clients) {
        // Gather all active promotions
        const activePromotions = client.addedpromotions.filter(promo => promo.status === 'Active');

        // Check for promotions nearing expiration
        for (const promo of activePromotions) {
            const promoEndDate = new Date(promo.endDate);

            // Extract the date parts for comparison (YYYY-MM-DD)
            const promoEndDay = promoEndDate.toISOString().split('T')[0];
            const thresholdDay = expirationThreshold.toISOString().split('T')[0];

            // Check if the promotion end day is the same as the expiration threshold day
            if (promoEndDay === thresholdDay) {
                try {
                    const promotionName = await Promotion.findById(promo.promotion);
                    emailText = `${actionDetails.message} <br> <br> Nombre de la promoción: ${promotionName.title} <br> <br> Fecha de Expiración: ${promoEndDay} <br> <br> <img src="${account.logo}" height="100"></img>`

                    sendMarketingEmail({
                        to: client.email,
                        subject: actionDetails.subject,
                        ...(actionDetails.header ? { header: actionDetails.header } : {}),
                        text: emailText
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