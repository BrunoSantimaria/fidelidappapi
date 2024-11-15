const cron = require('node-cron');
const AutomationRule = require('./automationRules.model');
const { handleClientInactivity, handlePromotionExpiration, handleCustomDateRule } = require('./automationHandlers');

automationCronJob = cron.schedule('0 09 * * *', async () => { // Corre todos los dias a las 9:00 AM
//automationCronJob = cron.schedule('*/30 * * * * *', async () => { // Cada 30 segundos
        console.log('Executing automation rules...');
        try {
            const rules = await AutomationRule.find({ isActive: true }).populate('account');
            for (const rule of rules) {
                switch (rule.condition) {
                    case 'clientInactivity':
                        await handleClientInactivity(rule);
                        break;
                    case 'promotionExpiration':
                        await handlePromotionExpiration(rule);
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