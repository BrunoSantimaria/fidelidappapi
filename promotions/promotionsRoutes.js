const express = require("express");
const router = express.Router();
const promotionController = require("./promotionsController");
const { verifyToken } = require("../middleware/verifyToken.js");
const { fileUpload } = require("./imagesutils/filemanager.js");

// Route to handle creating a new promotion
router.post("/create", verifyToken, fileUpload, promotionController.createPromotion);
router.get("", verifyToken, promotionController.getPromotions);
router.get("/:id", promotionController.getPromotionById);
router.post("/client", promotionController.addClientToPromotion);
router.get("/:cid/:pid", promotionController.getClientPromotion);
router.post("/visit", promotionController.redeemVisits);
router.delete("/:id", verifyToken, promotionController.deletePromotion);
router.post("/restart", promotionController.restartPromotion);
router.post("/redeem", promotionController.redeemPromotion);
router.put("/:pid", verifyToken, fileUpload, promotionController.updatePromotion);
router.post("/complete", promotionController.redeemPromotionByQRCode);
router.post("/redeem-points", promotionController.redeemPoints); // Esta línea es la que agregas
router.post("/redeemPromotion", promotionController.redeemPromotionPoints);

module.exports = router;
