const cron = require("node-cron");
const Promotion = require("../promotions/promotions.model"); // Adjust the path to your model


//cron.schedule('*/10 * * * * *', async () => { // Cada 5 segundo para testing
// Cron job: Runs every day 4 AM Server Time (UTC ?)
cron.schedule("0 4 * * *", async () => {
    console.log("Running daily promotion status update...");
    try {
        const today = new Date();
        const currentDayOfWeek = today.getDay() || 7; // Sunday (0) becomes 7

        console.log("Current day of the week:", currentDayOfWeek);

        // Fetch all promotions
        const promotions = await Promotion.find();

        const updates = promotions.map(async (promo) => {
            // Check if both startDate and endDate exist
            if (!promo.startDate || !promo.endDate) {
                console.log(`Skipping promotion ${promo._id} due to missing dates`);
                return; // Skip updating this promotion
            }

            // Check if the current date is within the start and end date range
            const isWithinDateRange =
                today >= new Date(promo.startDate) && today <= new Date(promo.endDate);

            // Check if the current day is in the active days of the week
            const isActiveDay = promo.daysOfWeek.includes(currentDayOfWeek);

            // Determine the new status
            const newStatus = isWithinDateRange && isActiveDay ? "active" : "inactive";

            // Update the status only if it has changed
            if (promo.status !== newStatus) {
                console.log(`Updating promotion ${promo._id} status to ${newStatus}`);
                promo.status = newStatus;
                await promo.save();
            }
        });

        await Promise.all(updates);

        console.log("Promotion statuses updated successfully.");
    } catch (err) {
        console.error("Error updating promotion statuses:", err);
    }
});


const { sendWeeklyReport } = require("../promotions/promotionsController");

// Schedule the cron job to run at 8 AM every Friday
//cron.schedule('*/30 * * * * *', async () => { // Cada 30 segundo para testing
cron.schedule('0 17 * * 5', async () => {
  console.log("Running weekly report email job:", new Date());
  await sendWeeklyReport();
  console.log("Weekly report email job completed.");
});

