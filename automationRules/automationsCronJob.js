const cron = require('node-cron');
const AutomationRule = require('./automationRules.model');
const { handleRegistrationDate, handlePromotionExpiration, handleclientRegistration } = require('./automationHandlers');

//automationCronJob = cron.schedule('0 13 * * *', async () => { // Corre todos los dias a las 13 UTC 09 am Chile
automationCronJob = cron.schedule('*/30 * * * * *', async () => { // Cada 30 segundos
        console.log('Executing automation rules...');
        try {
            const rules = await AutomationRule.find({ isActive: true }).populate('account');
            for (const rule of rules) {
                switch (rule.condition) {
                    // case 'clientInactivity':
                    //     await handleClientInactivity(rule);
                    //     break;
                    case 'promotionExpiration':
                        await handlePromotionExpiration(rule);
                        break;
                    case 'clientRegistration':
                        await handleclientRegistration(rule);
                        break;
                    case 'registrationDate':
                        await handleRegistrationDate(rule);
                        break;
                    default:
                        console.log(`No handler defined for condition: ${rule.condition}`);
                }
            }
        } catch (error) {
            console.error('Error executing automation rules:', error);
        }
    });

    module.exports = automationCronJob