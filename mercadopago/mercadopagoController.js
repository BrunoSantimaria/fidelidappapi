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
const createPreapproval = async () => {
  try {
    const preapprovalData = {
      reason: "Plan Pro",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        repetitions: 12,
        billing_day: 10,
        billing_day_proportional: true,
        transaction_amount: 15,
        currency_id: "ARS",
      },
      payment_methods_allowed: {
        payment_types: [
          { id: "credit_card" }, // Agrega "credit_card" para permitir pagos con tarjeta
          { id: "debit_card" }, // Opcionalmente, puedes incluir también "debit_card"
        ],
        payment_methods: [], // Deja esto vacío si quieres permitir todas las tarjetas
      },
      back_url: "https://google.com.ar",
    };

    const resp = await axios.post(`https://api.mercadopago.com/preapproval_plan`, preapprovalData, {
      headers: {
        Authorization: `Bearer APP_USR-1706813158335899-102914-67bc9a1f0eb0800468ada971bb9a408d-2064050259`,
      },
    });
    console.log(resp.data.id);

    return resp.data.id;
  } catch (error) {
    console.error("Error creating preapproval:", error);
    throw new Error("Failed to create preapproval");
  }
};

const createPreference = async (req, res) => {
  try {
    const { title, description, price, email, accountId, items } = req.body;

    // Crear la preferencia de pago
    const preferenceData = {
      items: [
        {
          title,
          description,
          quantity: Number(items[0].quantity),
          currency_id: "ARS",
          unit_price: Number(items[0].price),
        },
      ],
      back_urls: {
        success: `${BASE_URL}/payment/callback`,
        failure: `${BASE_URL}/payment/callback`,
        pending: `${BASE_URL}/payment/callback`,
      },
      auto_return: "approved",
      payer: { email },
      metadata: { accountId },
    };

    const preference = new Preference(client);
    const result = await preference.create({ body: preferenceData });

    // Crear la preaprobación y obtener su ID
    const subscriptionId = await createPreapproval();

    // Guardar el ID de la preferencia y el de la suscripción en la cuenta
    await Account.updateOne({ _id: accountId }, { $set: { preferenceId: result.id, subscriptionId: subscriptionId } });

    res.status(200).json({ id: result.id, subscriptionId: subscriptionId }); // Retorna el ID de la preferencia
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
const obtenerPayerId = async (subscriptionId) => {
  try {
    const response = await axios.get(`https://api.mercadopago.com/preapproval/search`, {
      params: {
        preapproval_plan_id: subscriptionId,
      },
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
    });

    const subscriptions = response.data.results;

    if (subscriptions.length > 0) {
      const payerId = subscriptions[0].payer_id;
      return payerId;
    } else {
      console.log("No se encontraron suscripciones para el preapproval_plan_id proporcionado.");
      return null;
    }
  } catch (error) {
    console.error("Error al obtener el payer_id:", error.response?.data || error.message);
    return null;
  }
};

// Función checkSubscription actualizada
const cancelActiveSubscriptions = async (subscriptions) => {
  const cancelPromises = subscriptions.map(async (subscription) => {
    const subscriptionId = subscription.id; // ID de la suscripción a cancelar
    const response = await axios.put(
      `https://api.mercadopago.com/preapproval/${subscriptionId}/`,
      { status: "cancelled" },
      {
        headers: {
          Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
        },
      }
    );
    return response.data; // Devuelve la respuesta de la API para cada cancelación
  });

  return Promise.all(cancelPromises); // Espera a que se completen todas las cancelaciones
};

// Endpoint para cancelar suscripciones
const cancelSubscriptions = async (req, res) => {
  console.log(req.body);
  const { accountId } = req.body; // Recibimos accountId del cuerpo de la solicitud

  try {
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    const payerId = await obtenerPayerId(account.subscriptionId);

    if (!payerId) {
      return res.status(404).json({ message: "No se encontró el payer_id asociado." });
    }

    const response = await axios.get(`https://api.mercadopago.com/preapproval/search?payer_id=${payerId}`, {
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
    });

    const subscriptions = response.data.results;

    // Asegúrate de que subscriptions sea un array
    console.log("Subscriptions:", subscriptions);

    // Filtrar suscripciones autorizadas
    const activeSubscriptions = subscriptions.filter((sub) => sub.status === "authorized");

    console.log("Active Subscriptions:", activeSubscriptions);

    if (Array.isArray(activeSubscriptions) && activeSubscriptions.length > 0) {
      // Cancelar todas las suscripciones activas
      const cancelResults = await cancelActiveSubscriptions(activeSubscriptions);
      console.log("Cancelación de suscripciones:", cancelResults);

      // Actualiza la cuenta a 'free'
      await Account.updateOne({ _id: accountId }, { planStatus: "free", isActive: false, planExpiration: null });

      return res.status(200).json({ message: "Todas las suscripciones han sido canceladas.", cancelResults });
    } else {
      return res.status(200).json({ message: "No hay suscripciones activas para cancelar." });
    }
  } catch (error) {
    console.error("Error en el endpoint /api/mercadopago/cancel_subscription:", error);
    return res.status(500).json({ message: "Error al verificar y cancelar las suscripciones." });
  }
};
const checkSubscription = async (req, res) => {
  const { accountId } = req.params;

  try {
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    // Obtener payer_id usando la función obtenerPayerId
    const payerId = await obtenerPayerId(account.subscriptionId);

    if (!payerId) {
      return res.status(404).json({ message: "No se encontró el payer_id asociado." });
    }

    const response = await axios.get(`https://api.mercadopago.com/preapproval/search?payer_id=${payerId}`, {
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
    });

    const subscriptions = response.data.results;

    // Filtrar suscripciones autorizadas
    const activeSubscriptions = subscriptions.filter((sub) => sub.status === "authorized");

    if (activeSubscriptions.length > 0) {
      // Cancelar todas las suscripciones activas
      const cancelResults = await cancelSubscriptions(activeSubscriptions);

      // Actualiza la cuenta a 'free' ya que todas las suscripciones han sido canceladas
      await Account.updateOne({ _id: accountId }, { planStatus: "free", isActive: false, planExpiration: null });

      return res.status(200).json({ message: "Todas las suscripciones han sido canceladas.", cancelResults });
    } else {
      return res.status(200).json({ message: "No hay suscripciones activas para cancelar." });
    }
  } catch (error) {
    console.error("Error en checkSubscription:", error);
    return res.status(500).json({ message: "Error al verificar las suscripciones." });
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

  modifySubscriptionAmount,
  modifyPrimaryCard,
  modifySecondaryPaymentMethod,
  changeSubscriptionStatus,
  reactivateSubscription,
  changeBillingDate,
  setProportionalAmount,
  offerFreeTrial,
  paymentCallback,
  cancelSubscriptions,
};
