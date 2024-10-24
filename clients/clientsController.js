const Client = require("../promotions/client.model");
const { Account } = require("../accounts/Account.model.js");
const { StrToObjectId } = require("../utils/StrToObjectId");
const Promotion = require("../promotions/promotions.model.js"); // Importa el modelo de promociones

exports.getAccountClients = async (req, res) => {
  const { accountId } = req.query;
  const accountIdObj = StrToObjectId(accountId);

  try {
    // Buscar la cuenta con las promociones del restaurante
    const account = await Account.findById(accountIdObj).populate({
      path: "promotions", // Poblar las promociones del restaurante
      model: "Promotion",
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Obtener los IDs de las promociones asociadas al restaurante (owner)
    const restaurantPromotionIds = account.promotions.map((promo) => promo._id);

    // Buscar los clientes asociados al `accountId`, sin importar si tienen promociones o no
    const clients = await Client.find({
      "addedAccounts.accountId": accountIdObj, // Buscar dentro del array `addedAccounts` por el `accountId`
    });

    if (!clients.length) {
      return [];
    }

    // Para cada cliente, filtrar las promociones que coincidan con las del restaurante y filtrar addedAccounts
    const updatedClients = clients.map((client) => {
      // Filtrar las promociones del cliente que coincidan con las promociones del restaurante
      const filteredPromotions = client.addedpromotions.filter((promotionEntry) =>
        restaurantPromotionIds.some((promoId) => promoId.equals(promotionEntry.promotion))
      );

      // Filtrar los `addedAccounts` para devolver solo el que coincide con el `accountId`
      const filteredAccounts = client.addedAccounts.filter((account) => account.accountId.equals(accountIdObj));

      // Retornar el cliente con las promociones y cuentas filtradas
      return {
        ...client.toObject(),
        addedpromotions: filteredPromotions, // Solo las promociones que coincidan
        addedAccounts: filteredAccounts, // Solo la cuenta que coincida
      };
    });

    // Enviar la respuesta con los clientes actualizados
    return res.status(200).json({ clients: updatedClients });
  } catch (error) {
    console.error("Error fetching and updating clients:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Función que define si una promoción es relevante para un cliente
function isRelevantPromotionForClient(client, promotion) {
  // Aquí puedes definir tu propia lógica para determinar si la promoción es relevante.
  // Por ejemplo, se puede usar el email del cliente o algún otro campo que relacione al cliente con la promoción.
  // En este caso, la comparación es basada en email, pero puedes ajustarla según tus necesidades.

  return client.email === promotion.userID.email;
}

// Añadir un cliente
exports.addClient = async (req, res) => {
  const { accountId, clientData, promotionId } = req.body;
  console.log(`Este es el accountid ${accountId}, esta es la data del cliente, y esta es la promocion ${promotionId}`);

  const accountIdObj = StrToObjectId(accountId);
  const email = clientData.email.trim();

  try {
    // Buscar la cuenta
    const account = await Account.findById(accountIdObj).populate("promotions");

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    let client = await Client.findOne({ email: email.trim() });

    if (!client) {
      client = new Client({
        name: clientData.name,
        email: email.trim(),
        phoneNumber: clientData.phoneNumber,
        addedAccounts: [{ accountId: accountIdObj }],
        addedPromotions: promotionId ? [{ promotion: StrToObjectId(promotionId) }] : [],
      });
      await client.save();
    } else {
      if (!client.addedAccounts.some((entry) => entry.accountId.equals(accountIdObj))) {
        client.addedAccounts.push({ accountId: accountIdObj });
      }

      if (promotionId && !client.addedPromotions.some((entry) => entry.promotion.equals(StrToObjectId(promotionId)))) {
        client.addedPromotions.push({ promotion: StrToObjectId(promotionId) });
      }

      await client.save();
    }

    // Verificar si el cliente ya ha sido añadido a la cuenta
    if (Array.isArray(account.clients) && account.clients.some((existingClient) => existingClient.id.equals(client._id))) {
      // Si el cliente ya existe en la cuenta, lanzar un error
      return res.status(400).json({ message: "Client already exists in this account" });
    } else {
      account.clients.push({
        id: client._id,
        name: clientData.name,
        email: clientData.email.trim(),
        phoneNumber: clientData.phoneNumber,
        addedAccounts: [accountIdObj],
        addedPromotions: promotionId ? [StrToObjectId(promotionId)] : [],
      });
    }

    await account.save();

    return res.status(200).json({ message: "Client added successfully", clients: account.clients });
  } catch (error) {
    console.error("Error adding client:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Eliminar un cliente de la cuenta
exports.deleteClient = async (req, res) => {
  const { accountId, clientId } = req.body;

  const accountIdObj = StrToObjectId(accountId);
  const clientIdObj = StrToObjectId(clientId);

  try {
    const account = await Account.findById(accountIdObj);

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Eliminar cliente por su ID de la cuenta
    account.clients = account.clients.filter((client) => !client.id.equals(clientIdObj));

    // Guardar cambios
    await account.save();

    return res.status(200).json({ message: "Client deleted successfully", clients: account.clients });
  } catch (error) {
    console.error("Error deleting client:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Actualizar un cliente
exports.updateClient = async (req, res) => {
  const { accountId, clientId, clientData } = req.body;

  const accountIdObj = StrToObjectId(accountId);
  const clientIdObj = StrToObjectId(clientId);

  try {
    const account = await Account.findById(accountIdObj);

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Encontrar cliente en la cuenta
    const client = account.clients.find((client) => client.id.equals(clientIdObj));

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Actualizar cliente globalmente en la colección `Client`
    const globalClient = await Client.findById(clientIdObj);

    if (globalClient) {
      globalClient.name = clientData.name || globalClient.name;
      globalClient.email = clientData.email || globalClient.email;
      await globalClient.save();
    }

    // Actualizar los datos del cliente en la cuenta
    client.name = clientData.name || client.name;
    client.email = clientData.email || client.email;
    client.addedPromotions = clientData.addedPromotions || client.addedPromotions;

    // Guardar cambios en la cuenta
    await account.save();

    return res.status(200).json({ message: "Client updated successfully", client });
  } catch (error) {
    console.error("Error updating client:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
