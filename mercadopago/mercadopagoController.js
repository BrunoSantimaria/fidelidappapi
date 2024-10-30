const { MercadoPagoConfig, Payment, Preference } = require("mercadopago");
const { Account } = require("../accounts/Account.model");
const MERCADOPAGO_ACCESS_TOKEN = "APP_USR-1706813158335899-102914-67bc9a1f0eb0800468ada971bb9a408d-2064050259"; // Usa tu access token aquí
const axios = require("axios");
// Configuración de Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: "APP_USR-1706813158335899-102914-67bc9a1f0eb0800468ada971bb9a408d-2064050259",
});
const BASE_URL = process.env.BASE_URL;
// Controlador para crear una preferencia de pago recurrente

const createPreference = async (req, res) => {
  try {
    const { title, description, price, email, accountId, items } = req.body;

    // Configuración de la preferencia de pago
    const preferenceData = {
      items: [
        {
          title: title,
          description: description,
          quantity: Number(items[0].quantity),
          currency_id: "ARS",
          unit_price: Number(items[0].price),
        },
      ],
      back_urls: {
        success: `${BASE_URL}/payment/callback`, // URL a la que se redirigirá tras el pago
        failure: `${BASE_URL}/payment/callback`, // URL en caso de fallo
        pending: `${BASE_URL}/payment/callback`, // URL en caso de pago pendiente
      },
      auto_return: "approved",
      payer: {
        email: email,
      },
      metadata: {
        accountId: accountId, // Guardar el ID de la cuenta en los metadatos
      },
    };

    const preference = new Preference(client);
    const result = await preference.create({ body: preferenceData });

    // Guardar el ID de la preferencia en tu base de datos
    await Account.updateOne(
      { _id: accountId },
      { $set: { paymentPreferenceId: result.id, planStatus: "pending" } } // Guarda el ID de la preferencia
    );

    res.status(200).json({ id: result.id }); // Retorna el ID de la preferencia
  } catch (error) {
    console.error("Error al crear la preferencia:", error);
    res.status(500).json({ error: "Error al crear la preferencia" });
  }
};
const paymentCallback = async (req, res) => {
  try {
    const { collection_id, preference_id } = req.query; // Obtener los IDs del query params

    // Verificar la preferencia y obtener información del pago
    const response = await axios.get(`https://api.mercadopago.com/v1/payments/${collection_id}`, {
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
    });

    const paymentData = response.data;

    // Obtener el accountId desde los metadatos
    const accountId = paymentData.metadata.accountId;

    // Guardar el payer_id y actualizar el estado de la cuenta
    await Account.updateOne(
      { _id: accountId },
      {
        $set: {
          planStatus: paymentData.status === "approved" ? "active" : "failed",
          payerId: paymentData.payer.id, // Guarda el payer_id aquí
        },
      }
    );

    res.status(200).json({ message: "Estado de pago actualizado", payerId: paymentData.payer.id });
  } catch (error) {
    console.error("Error en el callback de pago:", error);
    res.status(500).json({ error: "Error al procesar el callback de pago" });
  }
};
// Controlador para verificar el estado de la suscripción
// Controlador para verificar el estado de la suscripción
const checkSubscription = async (req, res) => {
  try {
    const { accountId } = req.params;
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    // const subscriptionId = account.subscriptionId; // Asegúrate de que esto esté definido
    // if (!subscriptionId) {
    //   return res.status(400).json({ message: "ID de suscripción no encontrado" });
    // }

    // Aquí deberías hacer la llamada a la API para verificar la suscripción
    const response = await axios.get(`https://api.mercadopago.com/preapproval/search/`, {
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
    });
    console.log(response.data);
    const subscription = response.data;

    if (subscription.status === "cancelled") {
      await Account.updateOne({ _id: accountId }, { planStatus: "free", isActive: false, planExpiration: null });
      return res.json({ message: "Tu plan ha expirado y ahora estás en el plan Free" });
    }

    res.json({
      message: `Tienes el plan ${subscription.status} activo`, // Cambia según el campo correcto
      expirationDate: subscription.expiration_date, // Cambia según el campo correcto
    });
  } catch (error) {
    console.error("Error al verificar la suscripción:", error.response.data);
    res.status(500).json({ error: "Error al verificar la suscripción" });
  }
};

// Controlador para cancelar la suscripción
const cancelSubscription = async (req, res) => {
  try {
    const { accountId } = req.body;
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    const subscriptionId = account.subscriptionId; // Suponiendo que el ID de suscripción se guarda en la cuenta
    await client.subscriptions.cancel(subscriptionId); // Llamada a la API para cancelar la suscripción

    await Account.updateOne({ _id: accountId }, { isActive: false, planStatus: "cancelled" });

    res.json({ message: "Suscripción cancelada. Podrás usar el servicio hasta que expire el tiempo restante." });
  } catch (error) {
    console.error("Error al cancelar la suscripción:", error);
    res.status(500).json({ error: "Error al cancelar la suscripción" });
  }
};

// Controlador para modificar el monto de una suscripción
const modifySubscriptionAmount = async (req, res) => {
  try {
    const { id, transaction_amount, currency_id } = req.body;

    const updatedSubscription = {
      auto_recurring: {
        transaction_amount: transaction_amount,
        currency_id: currency_id,
      },
    };

    await client.subscriptions.update(id, { body: updatedSubscription }); // Llamada a la API

    res.json({ message: "Monto de suscripción actualizado correctamente." });
  } catch (error) {
    console.error("Error al modificar el monto:", error);
    res.status(500).json({ error: "Error al modificar el monto de la suscripción." });
  }
};

// Controlador para modificar la tarjeta del medio de pago principal
const modifyPrimaryCard = async (req, res) => {
  try {
    const { id, card_token_id } = req.body;

    const updatedSubscription = {
      card_token_id,
    };

    await client.subscriptions.update(id, { body: updatedSubscription }); // Llamada a la API

    res.json({ message: "Tarjeta principal actualizada correctamente." });
  } catch (error) {
    console.error("Error al modificar la tarjeta principal:", error);
    res.status(500).json({ error: "Error al modificar la tarjeta principal." });
  }
};

// Controlador para modificar medio de pago secundario
const modifySecondaryPaymentMethod = async (req, res) => {
  try {
    const { id, card_token_id_secondary, payment_method_id_secondary } = req.body;

    const updatedSubscription = {
      card_token_id_secondary,
      payment_method_id_secondary,
    };

    await client.subscriptions.update(id, { body: updatedSubscription }); // Llamada a la API

    res.json({ message: "Método de pago secundario actualizado correctamente." });
  } catch (error) {
    console.error("Error al modificar el medio de pago secundario:", error);
    res.status(500).json({ error: "Error al modificar el medio de pago secundario." });
  }
};

// Controlador para pausar o cancelar la suscripción
const changeSubscriptionStatus = async (req, res) => {
  try {
    const { id, status } = req.body; // 'cancelled' o 'paused'

    const updatedSubscription = {
      status,
    };

    await client.subscriptions.update(id, { body: updatedSubscription }); // Llamada a la API

    res.json({ message: `Suscripción ${status === "cancelled" ? "cancelada" : "pausada"} correctamente.` });
  } catch (error) {
    console.error("Error al cambiar el estado de la suscripción:", error);
    res.status(500).json({ error: "Error al cambiar el estado de la suscripción." });
  }
};

// Controlador para reactivar una suscripción
const reactivateSubscription = async (req, res) => {
  try {
    const { id } = req.body; // ID de la suscripción a reactivar

    const updatedSubscription = {
      status: "active", // Cambiar el estado a activo
    };

    await client.subscriptions.update(id, { body: updatedSubscription }); // Llamada a la API

    res.json({ message: "Suscripción reactivada correctamente." });
  } catch (error) {
    console.error("Error al reactivar la suscripción:", error);
    res.status(500).json({ error: "Error al reactivar la suscripción." });
  }
};

// Controlador para cambiar la fecha de facturación
const changeBillingDate = async (req, res) => {
  try {
    const { id, billing_day } = req.body; // Día de facturación

    const updatedSubscription = {
      billing_day,
    };

    await client.subscriptions.update(id, { body: updatedSubscription }); // Llamada a la API

    res.json({ message: "Fecha de facturación actualizada correctamente." });
  } catch (error) {
    console.error("Error al cambiar la fecha de facturación:", error);
    res.status(500).json({ error: "Error al cambiar la fecha de facturación." });
  }
};

// Controlador para establecer monto proporcional
const setProportionalAmount = async (req, res) => {
  try {
    const { id, proportional_amount } = req.body; // Monto proporcional

    const updatedSubscription = {
      auto_recurring: {
        transaction_amount: proportional_amount,
      },
    };

    await client.subscriptions.update(id, { body: updatedSubscription }); // Llamada a la API

    res.json({ message: "Monto proporcional establecido correctamente." });
  } catch (error) {
    console.error("Error al establecer el monto proporcional:", error);
    res.status(500).json({ error: "Error al establecer el monto proporcional." });
  }
};

// Controlador para ofrecer una prueba gratuita
const offerFreeTrial = async (req, res) => {
  try {
    const { email, accountId } = req.body;

    // Crear la preferencia de prueba gratuita
    const freeTrialPreferenceData = {
      items: [
        {
          title: "Prueba Gratuita",
          description: "Prueba gratuita de 30 días",
          quantity: 1,
          currency_id: "ARS",
          unit_price: 0, // Precio gratis
        },
      ],
      back_urls: {
        success: "https://fidelidapp.cl/success",
        failure: "https://fidelidapp.cl/failure",
        pending: "https://fidelidapp.cl/pending",
      },
      auto_return: "approved",
      payer: {
        email: email,
      },
      metadata: {
        accountId: accountId, // Guardar el ID de la cuenta en los metadatos
      },
    };

    const preference = new Preference(client);
    const result = await preference.create({ body: freeTrialPreferenceData });

    res.status(200).json({ id: result.id }); // Retorna el ID de la preferencia
  } catch (error) {
    console.error("Error al ofrecer prueba gratuita:", error);
    res.status(500).json({ error: "Error al ofrecer prueba gratuita." });
  }
};

module.exports = {
  createPreference,
  checkSubscription,
  cancelSubscription,
  modifySubscriptionAmount,
  modifyPrimaryCard,
  modifySecondaryPaymentMethod,
  changeSubscriptionStatus,
  reactivateSubscription,
  changeBillingDate,
  setProportionalAmount,
  offerFreeTrial,
  paymentCallback,
};
