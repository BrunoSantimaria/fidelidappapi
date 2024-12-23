const Promotion = require("../promotions/promotions.model");
const { getChileanDateTime } = require("./getChileanDateTime");

const handlePromotionRedemption = async (client) => {
  try {
    console.log("handlePromotionRedemption");

    const promotions = client.addedpromotions;

    console.log("Client:", client);
    console.log("Promotions:", promotions);

    //For each promotion in the client's addedpromotions array
    for (const promotion of promotions) {
      //Find the promotion in the database
      const existingPromotion = await Promotion.findById(promotion.promotion.toString());
      if (!existingPromotion) {
        throw new Error("Promotion not found ");
      }
      console.log("Existing Promotion:", existingPromotion);

      if (promotion.status === "Redeemed" || promotion.status === "Expired") {
        throw new Error(`Promotion already ${promotion.status}`);
      }

      if (promotion.endDate < new Date()) {
        promotion.status = "Expired";
        await client.save();
        throw new Error("Promotion already expired");
      }

      promotion.actualVisits += 1;
      promotion.visitDates.push(getChileanDateTime());

      if (promotion.actualVisits >= existingPromotion.visitsRequired) {
        promotion.status = "Redeemed";
      }

      await client.save();
    }
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  handlePromotionRedemption,
};
