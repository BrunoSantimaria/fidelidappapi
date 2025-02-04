const cron = require("node-cron");
const Segment = require("./segment.model");
const Client = require("../promotions/client.model");
const moment = require("moment-timezone");
const { getFilteredClients  } = require("./clientUtils");

// Function to filter clients based on segment criteria
async function findMatchingClients(filters, accountId) {
    let query = { accountId }; // Start with account filter

    // Apply filters dynamically
    if (filters.hasPhoneNumber) query.phoneNumber = { $exists: true };
    if (filters.email) query.email = filters.email;
    if (filters.name) query.name = { $regex: filters.name, $options: "i" };

    // Points range
    if (filters.pointsRange?.min || filters.pointsRange?.max) {
        query.points = {};
        if (filters.pointsRange.min) query.points.$gte = filters.pointsRange.min;
        if (filters.pointsRange.max) query.points.$lte = filters.pointsRange.max;
    }

    // Activity type filter
    if (filters.activityType?.length > 0) {
        query.activities = { $elemMatch: { type: { $in: filters.activityType } } };
    }

    // Date range filter
    if (filters.dateRange?.start || filters.dateRange?.end) {
        const startDate = filters.dateRange.start
            ? moment.utc(filters.dateRange.start).startOf("day").toDate()
            : null;
        const endDate = filters.dateRange.end
            ? moment.utc(filters.dateRange.end).endOf("day").toDate()
            : null;

        query.activities = query.activities || {};
        query.activities.$elemMatch = {
            ...(startDate && { date: { $gte: startDate } }),
            ...(endDate && { date: { $lte: endDate } }),
        };
    }

    // Available hours filter
    if (filters.availableHours?.length > 0) {
        query.activities = query.activities || {};
        query.activities.$elemMatch = {
            ...query.activities.$elemMatch,
            date: {
                $gte: moment.utc().startOf("day").toDate(), // Only check recent activities
                $lte: moment.utc().endOf("day").toDate(),
            },
        };
    }

    // Find matching clients
    return await Client.find(query);
}

// Cron job runs every 30 seconds for testing
//cron.schedule("*/10 * * * * *", async () => {
// Cron job runs at 4:00 AM every day
cron.schedule("0 4 * * *", async () => {

    console.log("Running segment auto-tagging cron job...");

    try {
        const segments = await Segment.find({});
        if (segments.length === 0) {
            console.log("No segments found to process.");
            return;
        }

        for (const segment of segments) {
            console.log(`Processing segment: ${segment.tag} for account: ${segment.accountId} with filters ${JSON.stringify(segment.filters)}`); 
            const { filters, accountId, tag } = segment;

            // Find new matching clients
            const matchingClients = await getFilteredClients(filters, accountId);
            //console.log("Matching clients:", matchingClients);

            if (matchingClients.length > 0) {
                console.log(`Adding ${matchingClients.length} clients to tag: ${tag}`);

                await Client.updateMany(
                    { _id: { $in: matchingClients.map(client => client._id) } },
                    { $addToSet: { tags: tag } }
                );
            }
        }

        console.log("Segment auto-tagging completed.");
    } catch (error) {
        console.error("Error running cron job:", error);
    }
});
