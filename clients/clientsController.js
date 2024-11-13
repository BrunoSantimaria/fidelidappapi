const Client = require("../promotions/client.model");
const Account = require("../accounts/Account.model.js");
const { StrToObjectId } = require("../utils/StrToObjectId");
const Promotion = require("../promotions/promotions.model.js"); // Importa el modelo de promociones

exports.getAccountClients = async (req, res) => {
  const { accountId } = req.query;
  const accountIdObj = StrToObjectId(accountId);

  try {
    // Buscar la cuenta con las promociones del restaurante
    const account = await Account.findById(accountIdObj).populate({
      path: "promotions",
      model: "Promotion",
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Obtener los IDs de las promociones asociadas al restaurante (owner) y su tipo de sistema
    const restaurantPromotions = account.promotions.map((promo) => ({
      _id: promo._id,
      systemType: promo.systemType,
    }));

    // Buscar los clientes asociados al `accountId`, sin importar si tienen promociones o no
    const clients = await Client.find({
      "addedAccounts.accountId": accountIdObj,
    });

    if (!clients.length) {
      return res.status(200).json({ clients: [] });
    }

    // Para cada cliente, filtrar las promociones que coincidan con las del restaurante y sus cuentas asociadas
    const updatedClients = clients.map((client) => {
      // Filtrar las promociones del cliente que coincidan con las promociones del restaurante
      const filteredPromotions = client.addedpromotions
        .filter((promotionEntry) => restaurantPromotions.some((promo) => promo._id.equals(promotionEntry.promotion)))
        .map((promotionEntry) => {
          // Encontrar el tipo de sistema asociado a la promoción
          const restaurantPromo = restaurantPromotions.find((promo) => promo._id.equals(promotionEntry.promotion));
          return {
            ...promotionEntry.toObject(),
            systemType: restaurantPromo.systemType, // Añadir systemType a cada promoción
          };
        });

      // Filtrar los `addedAccounts` para devolver solo el que coincide con el `accountId`
      const filteredAccounts = client.addedAccounts.filter((account) => account.accountId.equals(accountIdObj));

      // Retornar el cliente con las promociones y cuentas filtradas
      return {
        ...client.toObject(),
        addedpromotions: filteredPromotions,
        addedAccounts: filteredAccounts,
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

exports.addClientsBatch = async (req, res) => {
  const { accountId, clientsData, promotionId } = req.body;
  console.log("Datos recibidos:", req.body);

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
        console.log(`Creando nuevo cliente: ${clientData.name} (${email})`);
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
        console.log(`Actualizando cliente existente: ${client.name} (${email})`);
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
      console.log(`Clientes nuevos guardados: ${clientsToAdd.map((client) => client.email)}`);
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
    console.log("Clientes agregados a la cuenta:", account.clients);

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
