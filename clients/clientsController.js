const Client = require("../promotions/client.model");
const Account = require("../accounts/Account.model.js");
const { StrToObjectId } = require("../utils/StrToObjectId");
const Promotion = require("../promotions/promotions.model.js"); // Importa el modelo de promociones

exports.getAccountClients = async (req, res) => {
  const { accountId } = req.query;
  const accountIdObj = StrToObjectId(accountId);

  try {
    // Realizar búsquedas en paralelo usando Promise.all
    const [account, clients] = await Promise.all([
      Account.findById(accountIdObj).populate("promotions", "_id systemType"),
      Client.find({ "addedAccounts.accountId": accountIdObj }),
    ]);

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    if (!clients.length) {
      return res.status(200).json({ clients: [] });
    }

    // Crear un Map para acceso más rápido a las promociones
    const promotionsMap = new Map(account.promotions.map((promo) => [promo._id.toString(), promo.systemType]));

    // Procesar clientes de manera más eficiente
    const updatedClients = clients.map((client) => {
      const filteredPromotions = client.addedpromotions
        .filter((promo) => promotionsMap.has(promo.promotion.toString()))
        .map((promo) => ({
          ...promo.toObject(),
          systemType: promotionsMap.get(promo.promotion.toString()),
        }));

      return {
        ...client.toObject(),
        addedpromotions: filteredPromotions,
        addedAccounts: [client.addedAccounts.find((acc) => acc.accountId.equals(accountIdObj))].filter(Boolean),
      };
    });

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
      // Si no existe el cliente, lo creamos
      client = new Client({
        name: clientData.name,
        email: email.trim(),
        phoneNumber: clientData.phoneNumber,
        addedAccounts: [{ accountId: accountIdObj }],
        addedPromotions: promotionId ? [{ promotion: StrToObjectId(promotionId) }] : [],
      });
      await client.save();
    } else {
      // Si el cliente ya existe, actualizamos el nombre si viene en la data
      if (clientData.name) {
        client.name = clientData.name;
      }

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
        name: client.name, // Aseguramos que el nombre esté actualizado
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

exports.addClientsBatch = async (req, res) => {
  const { accountId, clientsData, promotionId } = req.body;

  // Verificar que clientsData sea un array y no esté vacío
  if (!Array.isArray(clientsData) || clientsData.length === 0) {
    return res.status(400).json({ message: "clientsData debe ser un array y no estar vacío" });
  }

  const accountIdObj = StrToObjectId(accountId);

  try {
    const account = await Account.findById(accountIdObj).populate("promotions");
    if (!account) {
      console.error(`Cuenta no encontrada para accountId: ${accountId}`);
      return res.status(404).json({ message: "Account not found" });
    }

    const emails = clientsData.map((client) => client.email.trim());
    const existingClients = await Client.find({ email: { $in: emails } });
    const existingClientsMap = new Map(existingClients.map((client) => [client.email, client]));

    const clientsToAdd = [];
    const clientsToUpdate = [];

    for (const clientData of clientsData) {
      const email = clientData.email.trim();
      let client = existingClientsMap.get(email);

      if (!client) {
        // Crear nuevo cliente si no existe

        client = new Client({
          name: clientData.name,
          email,
          phoneNumber: clientData.phoneNumber,
          addedAccounts: [{ accountId: accountIdObj }],
          addedPromotions: promotionId ? [{ promotion: StrToObjectId(promotionId) }] : [],
        });
        clientsToAdd.push(client);
      } else {
        // Actualizar cliente existente

        const isClientInAccount = client.addedAccounts.some((entry) => entry.accountId.equals(accountIdObj));
        if (!isClientInAccount) {
          client.addedAccounts.push({ accountId: accountIdObj });
        }
        if (promotionId && !client.addedPromotions.some((entry) => entry.promotion.equals(StrToObjectId(promotionId)))) {
          client.addedPromotions.push({ promotion: StrToObjectId(promotionId) });
        }
        clientsToUpdate.push(client);
      }
    }

    // Guardar nuevos clientes en paralelo
    if (clientsToAdd.length > 0) {
      await Client.insertMany(clientsToAdd);
    }

    // Actualizar clientes existentes en paralelo
    if (clientsToUpdate.length > 0) {
      await Promise.all(clientsToUpdate.map((client) => client.save()));
    }

    // Agregar los clientes a la cuenta
    account.clients.push(
      ...clientsToAdd.map((client) => ({
        id: client._id,
        name: client.name,
        email: client.email,
        phoneNumber: client.phoneNumber,
      })),
      ...clientsToUpdate.map((client) => ({
        id: client._id,
        name: client.name,
        email: client.email,
        phoneNumber: client.phoneNumber,
      }))
    );

    // Guardar cambios en la cuenta
    await account.save();

    return res.status(200).json({ message: "Clients added successfully", clients: account.clients });
  } catch (error) {
    console.error("Error al agregar clientes en lote:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// Eliminar un cliente de la cuenta
exports.deleteClient = async (req, res) => {
  const { accountId, clientId } = req.body;

  const accountIdObj = StrToObjectId(accountId);
  const clientIdObj = StrToObjectId(clientId);

  try {
    // Buscar la cuenta
    const account = await Account.findById(accountIdObj);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Buscar el cliente
    const client = await Client.findById(clientIdObj);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Eliminar la relación de la cuenta con el cliente (usando $pull para eficiencia)
    await Account.findByIdAndUpdate(accountIdObj, {
      $pull: { clients: { id: clientIdObj } },
    });

    // Eliminar la relación del cliente con la cuenta
    await Client.findByIdAndUpdate(clientIdObj, {
      $pull: { addedAccounts: { accountId: accountIdObj } },
    });

    return res.status(200).json({
      message: "Client deleted successfully",
      clients: account.clients, // Devuelve la lista actualizada de clientes en la cuenta
    });
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
