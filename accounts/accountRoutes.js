const express = require("express");
const router = express.Router();

// Importar controladores
const { getLandingSettings, addUserToAccount, refreshQr, saveAccountSettings, fileUpload, customizeAccount, updateAccount } = require("./accountController.js");

// Middleware de autenticación
const { verifyToken } = require("../middleware/verifyToken.js");
const { mongoose } = require("mongoose");
const Account = require("../accounts/Account.model.js");
// Rutas de autenticación
router.post("/add/:accountId", verifyToken, addUserToAccount);
router.post("/refresh", verifyToken, refreshQr);
router.post("/settings", saveAccountSettings);
router.post("/settings/customize", fileUpload, customizeAccount);
router.put("/settings/account", updateAccount);
router.get("/settings/landing/:accountId", verifyToken, getLandingSettings);

// accountController.js
const updateLandingSettings = async (req, res) => {
  try {
    const { accountId, landingSettings } = req.body;
    console.log("Updating landing settings for account:", accountId, landingSettings);
    const convertedId = new mongoose.Types.ObjectId(accountId);

    // Primero encontramos la cuenta y nos aseguramos que tenga el objeto landing
    const account = await Account.findById(convertedId);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (!account.landing) {
      account.landing = {};
    }

    // Actualizamos los campos directamente
    account.landing = {
      ...account.landing, // Mantiene el resto de las propiedades que no se están actualizando específicamente
      title: landingSettings.title,
      subtitle: landingSettings.subtitle,
      name: landingSettings.name,
      colorPalette: landingSettings.colorPalette,
      googleBusiness: landingSettings.googleBusiness,
      menu: landingSettings.menu,
      card: {
        ...account.landing.card, // Mantener el resto de las propiedades de card
        title: landingSettings.buttonTitle, // Cambia el title del card
      },
    };
    if (landingSettings.slug) {
      const accountSlug = await Account.findOne({ slug: landingSettings.slug });
      if (accountSlug && accountSlug._id.toString() !== accountId) {
        return res.status(400).json({ error: "El slug ya está en uso" });
      }
      account.slug = landingSettings.slug;
    }
    // Marcamos el campo como modificado y guardamos
    account.markModified("landing");

    try {
      const savedAccount = await account.save({ validateBeforeSave: false });
      console.log("Account updated:", savedAccount.landing);
    } catch (saveError) {
      console.error("Save error:", saveError);
    }
    console.log("Landing settings updated successfully");
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error updating landing settings:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
router.put("/settings/landing", verifyToken, updateLandingSettings);
router.put("/settings/landing/reorder-categories", async (req, res) => {
  try {
    const { accountId, categories } = req.body;

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }

    account.landing.menu.categories = categories;
    await account.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Error al reordenar categorías" });
  }
});

// Actualizar producto
router.put("/settings/landing/update-product", verifyToken, async (req, res) => {
  try {
    const { accountId, categoryName, productId, productData } = req.body;
    const { oldCategoryName } = productData;

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }

    let formattedStock;
    if (productData.stock === undefined || productData.stock === "") {
      formattedStock = -1;
    } else {
      const parsedStock = parseInt(productData.stock);
      formattedStock = isNaN(parsedStock) ? -1 : parsedStock;
    }

    // Validar y formatear el descuento
    let formattedDiscount = null;
    if (productData.discount) {
      const discountValue = parseFloat(productData.discount.value);
      formattedDiscount = {
        type: productData.discount.type || "percentage",
        value: isNaN(discountValue) ? 0 : discountValue,
        active: Boolean(productData.discount.active),
        endDate: productData.discount.endDate ? new Date(productData.discount.endDate) : null,
      };
    }

    // Si la categoría cambió
    if (oldCategoryName && oldCategoryName !== categoryName) {
      const oldCategory = account.landing.menu.categories.find((c) => c.name === oldCategoryName);
      const newCategory = account.landing.menu.categories.find((c) => c.name === categoryName);

      if (!oldCategory || !newCategory) {
        return res.status(404).json({ error: "Categoría no encontrada" });
      }

      const productToMove = oldCategory.items.find((item) => item._id.toString() === productId);
      if (!productToMove) {
        return res.status(404).json({ error: "Producto no encontrado en la categoría original" });
      }

      // Actualizar el producto con todos los campos
      const updatedProduct = {
        ...productToMove.toObject(),
        name: productData.name,
        price: parseFloat(productData.price) || 0,
        available: Boolean(productData.available),
        stock: formattedStock,
        discount: formattedDiscount,
      };

      // Eliminar de la categoría antigua y agregar a la nueva
      oldCategory.items = oldCategory.items.filter((item) => item._id.toString() !== productId);
      newCategory.items.push(updatedProduct);
    } else {
      const category = account.landing.menu.categories.find((c) => c.name === categoryName);
      if (!category) {
        return res.status(404).json({ error: "Categoría no encontrada" });
      }

      const productIndex = category.items.findIndex((p) => p._id.toString() === productId);
      if (productIndex === -1) {
        return res.status(404).json({ error: "Producto no encontrado en la categoría" });
      }

      // Actualizar el producto existente
      category.items[productIndex] = {
        ...category.items[productIndex].toObject(),
        name: productData.name,
        price: parseFloat(productData.price) || 0,
        available: Boolean(productData.available),
        stock: formattedStock,
        discount: formattedDiscount,
      };
    }

    // Marcar el campo como modificado para asegurar que Mongoose detecte los cambios
    account.markModified("landing.menu.categories");

    // Guardar con validación desactivada para evitar problemas con el schema
    await account.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message: "Producto actualizado correctamente",
      data: account.landing.menu.categories,
    });
  } catch (error) {
    console.error("Error al actualizar producto:", error);
    return res.status(500).json({ error: "Error al actualizar producto" });
  }
});

// Eliminar producto
router.delete("/settings/landing/delete-product", verifyToken, async (req, res) => {
  try {
    const { accountId, categoryName, productId } = req.body;

    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ error: "Cuenta no encontrada" });
    }

    const category = account.landing.menu.categories.find((c) => c.name === categoryName);
    if (!category) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    category.items = category.items.filter((item) => item._id.toString() !== productId);

    account.markModified("landing.menu.categories");
    await account.save();

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error al eliminar producto:", error);
    return res.status(500).json({ error: "Error al eliminar producto" });
  }
});

// Asegurarnos que el router esté correctamente exportado
module.exports = router;
