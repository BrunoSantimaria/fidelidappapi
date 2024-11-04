const { MercadoPagoConfig, Preference } = require("mercadopago");
const { Account } = require("../accounts/Account.model");
const axios = require("axios");
const BASE_URL = process.env.BASE_URL;
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const client = new MercadoPagoConfig({
  accessToken: MERCADOPAGO_ACCESS_TOKEN,
});

const createPreapproval = async () => {
  try {
    const preapprovalData = {
      reason: "Plan Pro - FidelidApp",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 950,
        currency_id: "CLP",
      },
      payment_methods_allowed: {
        payment_types: [{ id: "credit_card" }, { id: "debit_card" }],
        payment_methods: [],
      },
      back_url: `https://fidelidapp.cl/dashboard/`,
    };

    const resp = await axios.post(`https://api.mercadopago.com/preapproval_plan`, preapprovalData, {
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
    });

    return resp.data.id;
  } catch (error) {
    console.error("Error creating preapproval:", error);
    throw new Error("Failed to create preapproval");
  }
};

const createPreference = async (req, res) => {
  try {
    const { title, description, price, email, accountId, items } = req.body;

    const preferenceData = {
      items: [
        {
          title,
          description,
          quantity: Number(items[0].quantity),
          currency_id: "CLP",
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

    const subscriptionId = await createPreapproval();

    await Account.updateOne({ _id: accountId }, { $set: { preferenceId: result.id, subscriptionId: subscriptionId } });

    res.status(200).json({ id: result.id, subscriptionId: subscriptionId });
  } catch (error) {
    console.error("Error al crear la preferencia:", error);
    res.status(500).json({ error: "Error al crear la preferencia" });
  }
};

const obtenerPayerId = async (subscriptionId, accountId) => {
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
      const account = await Account.findById(accountId);
      await account.updatePlan("free", null);
      console.log("No se encontraron suscripciones para el preapproval_plan_id proporcionado.");
      return null;
    }
  } catch (error) {
    console.error("Error al obtener el payer_id:", error.response?.data || error.message);
    return null;
  }
};

const cancelActiveSubscriptions = async (subscriptions) => {
  const cancelPromises = subscriptions.map(async (subscription) => {
    const subscriptionId = subscription.id;
    const response = await axios.put(
      `https://api.mercadopago.com/preapproval/${subscriptionId}/`,
      { status: "cancelled" },
      {
        headers: {
          Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
        },
      }
    );
    return response.data;
  });

  return Promise.all(cancelPromises);
};

const cancelSubscriptions = async (req, res) => {
  const { accountId } = req.body;

  try {
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    const payerId = await obtenerPayerId(account.subscriptionId, accountId);

    if (!payerId) {
      return res.status(404).json({ message: "No se encontró el payer_id asociado." });
    }

    const response = await axios.get(`https://api.mercadopago.com/preapproval/search?payer_id=${payerId}`, {
      headers: {
        Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
      },
    });

    const subscriptions = response.data.results;

    console.log("Subscriptions:", subscriptions);

    const activeSubscriptions = subscriptions.filter((sub) => sub.status === "authorized");

    console.log("Active Subscriptions:", activeSubscriptions);

    if (Array.isArray(activeSubscriptions) && activeSubscriptions.length > 0) {
      const cancelResults = await cancelActiveSubscriptions(activeSubscriptions);
      console.log("Cancelación de suscripciones:", cancelResults);

      await Account.updateOne({ _id: accountId }, { activePayer: false });

      return res
        .status(200)
        .json({ message: "Todas las suscripciones han sido canceladas. La cuenta seguirá en el plan 'Pro' hasta la fecha de expiración.", cancelResults });
    } else {
      return res.status(200).json({ message: "No hay suscripciones activas para cancelar." });
    }
  } catch (error) {
    console.error("Error en el endpoint /api/mercadopago/cancel_subscription:", error);
    return res.status(500).json({ message: "Error al verificar y cancelar las suscripciones." });
  }
};

// Activar suscripción Pro
const activateProSubscription = async (accountId, expirationDate) => {
  const account = await Account.findById(accountId);
  if (account) {
    await account.updatePlan("pro", expirationDate);
  } else {
    console.error("Account not found");
  }
};

const checkSubscription = async (req, res) => {
  const { accountId } = req.params;
  console.log(accountId);

  try {
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    const payerId = await obtenerPayerId(account.subscriptionId);

    if (!payerId) {
      await account.updatePlan("free", null);
      return res.status(404).json({ message: "No se encontró el payer_id asociado." });
    }

    const response = await axios.get(`https://api.mercadopago.com/preapproval/search?payer_id=${payerId}`, {
      headers: { Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}` },
    });

    const subscriptions = response.data.results;
    let latestSubscription = null;

    if (subscriptions && subscriptions.length > 0) {
      const activeOrPaidSubscriptions = subscriptions.filter((sub) => sub.status === "authorized" || sub.status === "pending" || sub.status === "cancelled");
      console.log("active", activeOrPaidSubscriptions);

      if (activeOrPaidSubscriptions.length > 0) {
        latestSubscription = activeOrPaidSubscriptions.reduce((latest, current) => {
          const currentLastModified = new Date(current.last_modified);
          if (!latest || currentLastModified > new Date(latest.last_modified)) {
            return current;
          }
          return latest;
        }, null);

        if (latestSubscription.status === "cancelled") {
          console.log("La suscripción ha sido cancelada.");
          account.activePayer = false;
          await account.save();
        } else {
          account.activePayer = true;
          await account.updatePlan("pro", latestSubscription.next_payment_date);
        }
      }
    }

    const expirationDate = account.planExpiration;
    if (expirationDate && new Date(expirationDate) > new Date()) {
      return res.json({ message: "El plan pro sigue vigente", expirationDate });
    }

    await account.updatePlan("free", null);
    return res.json({ message: "No hay suscripción activa, se ha actualizado a plan gratuito." });
  } catch (error) {
    console.error("Error al verificar la suscripción:", error);
    return res.status(500).json({ message: "Error al verificar la suscripción." });
  }
};

// Exportar las funciones
module.exports = {
  createPreference,
  cancelSubscriptions,
  checkSubscription,
};
