const { MercadoPagoConfig, Preference } = require("mercadopago");
const { Account } = require("../accounts/Account.model");

// Configura Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: "APP_USR-2752674633438112-102811-5b22a9e6a051f4b83ecc0d989d278afd-2061744497",
});

const createPreference = async (req, res) => {
  try {
    const { items, accountId } = req.body;

    // Validación de items y accountId
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Items array is required." });
    }
    if (!accountId) {
      return res.status(400).json({ error: "accountId is required." });
    }

    const body = {
      items: items.map((item) => ({
        title: item.title,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        currency_id: "ARS",
      })),
      back_urls: {
        success: "http://localhost:5173/dashboard",
        failure: "http://localhost:5173/",
        pending: "http://localhost:5173/",
      },
      auto_return: "approved",
    };

    const preference = new Preference(client);
    const result = await preference.create({ body });

    // Aquí puedes guardar la preferencia en tu base de datos si es necesario

    res.status(200).json({
      preferenceId: result.id,
      accountId: accountId,
    });
  } catch (error) {
    console.error("Error creating preference:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Endpoint para manejar la redirección de éxito
const handlePaymentSuccess = async (req, res) => {
  const { accountId, paymentId } = req.body;

  try {
    // Verificar que el paymentId es válido y obtener el estado del pago
    const paymentDetails = await getPaymentDetails(paymentId); // Implementa esta función

    if (paymentDetails.status === "approved") {
      const newExpirationDate = new Date();
      newExpirationDate.setDate(newExpirationDate.getDate() + 30); // 30 días de duración de la suscripción

      await updateUserPlanInDatabase(accountId, "Pro", newExpirationDate);

      res.status(200).json({ message: "Suscripción activada correctamente." });
    } else {
      res.status(400).json({ error: "Payment not approved." });
    }
  } catch (error) {
    console.error("Error al actualizar la suscripción:", error);
    res.status(500).json({ error: "Error interno al actualizar la suscripción." });
  }
};

// Función para obtener los detalles del pago (implementa según tu lógica)
const getPaymentDetails = async (paymentId) => {
  // Lógica para consultar el estado del pago en Mercado Pago
};

// Función para actualizar el plan en la base de datos
const updateUserPlanInDatabase = async (accountId, plan, expirationDate) => {
  try {
    await Account.findByIdAndUpdate(accountId, {
      planStatus: plan,
      planExpiration: expirationDate,
    });
  } catch (error) {
    console.error("Error updating user plan:", error);
  }
};

module.exports = { createPreference, handlePaymentSuccess };
