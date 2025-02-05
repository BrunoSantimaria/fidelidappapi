const Client = require("../promotions/client.model");
const Account = require("../accounts/Account.model.js");
const { StrToObjectId } = require("../utils/StrToObjectId");
const Promotion = require("../promotions/promotions.model.js"); // Importa el modelo de promociones
const moment = require('moment-timezone');
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;
const Segment = require("./segment.model"); // New model for storing segments
const { mapFilters, getFilteredClients  } = require("./clientUtils");



exports.getAccountClients = async (req, res) => {
  // Encuentra la cuenta por el email del usuario
  const account = await Account.findOne({ userEmails: req.email }).populate("promotions", "_id systemType");
  if (!account) return res.status(404).json({ error: "Account not found" });
  const accountIdObj = StrToObjectId(account._id);

  console.log("Getting clients for account:", accountIdObj);

  try {
    // Realizar búsquedas en paralelo usando Promise.all
    const [clients] = await Promise.all([
      Client.find({ "addedAccounts.accountId": accountIdObj }),
    ]);

    if (!clients.length) {
      return res.status(200).json({ clients: [] });
    }

    // Crear un Map para acceso más rápido a las promociones
    //const promotionsMap = new Map(account.promotions.map((promo) => [promo._id.toString(), promo.systemType]));

    // // Procesar clientes de manera más eficiente
    // const updatedClients = clients.map((client) => {
    //   const filteredPromotions = client.addedpromotions
    //     .filter((promo) => promotionsMap.has(promo.promotion.toString()))
    //     .map((promo) => ({
    //       ...promo.toObject(),
    //       systemType: promotionsMap.get(promo.promotion.toString()),
    //     }));

    //   return {
    //     ...client.toObject(),
    //     //addedpromotions: filteredPromotions,
    //     addedAccounts: [client.addedAccounts.find((acc) => acc.accountId.equals(accountIdObj))].filter(Boolean),
    //   };
    // });

    return res.status(200).json({ clients });
  } catch (error) {
    console.error("Error fetching and updating clients:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

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

  console.log("Deleting client:", clientId, "from account:", accountId);

  try {
    // Ensure the account exists
    const account = await Account.findById(accountId);
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // Ensure the client exists
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }

    // Remove the client ID from the account's clients array
    await Account.findByIdAndUpdate(accountId, {
      $pull: { clients: clientId }, // Assuming 'clients' is an array of ObjectIds
    });

    // Remove the account ID from the client's addedAccounts array
    await Client.findByIdAndUpdate(clientId, {
      $pull: { addedAccounts: { accountId } }, // Ensure addedAccounts contains objects with accountId
    });

    // Fetch the updated account to return the updated clients list
    const updatedAccount = await Account.findById(accountId).populate("clients"); // Adjust populate as needed

    return res.status(200).json({
      message: "Client deleted successfully",
      clients: updatedAccount.clients, // Updated list of clients
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

exports.getFilteredAccountClients = async (req, res) => {
  const { filters } = req.body;

  if (!filters) {
    return res.status(400).json({ error: "Missing filters in request body" });
  }

  try {
    // Encuentra la cuenta por el email del usuario
    const account = await Account.findOne({ userEmails: req.email }).populate("promotions", "_id systemType");
    if (!account) return res.status(404).json({ error: "Account not found" });
    const accountIdObj = StrToObjectId(account._id);

    // Parsea y traduce los filtros
    const parsedFilters = typeof filters === "string" ? JSON.parse(filters) : filters;
    //Apply translation mapfilters function
    const translatedFilters = await mapFilters(parsedFilters);
    console.log("Aplicando filtros:", translatedFilters);

    const filteredClients = await getFilteredClients(translatedFilters, accountIdObj)

    return res.status(200).json({ totalClients: filteredClients.length, clients: filteredClients });
  } catch (error) {
    console.error("Error processing filters:", error);
    return res.status(500).json({ error: "An error occurred while processing filters." });
  }
};

// Create new Segment
exports.addTagToClients = async (req, res) => {

  try {

    const { clients, tag, filters } = req.body;

    // Encuentra la cuenta por el email del usuario
    const account = await Account.findOne({ userEmails: req.email }).populate("promotions", "_id systemType");
    if (!account) return res.status(404).json({ error: "Account not found" });
    const accountId = StrToObjectId(account._id);

    console.log("Adding tag to clients:", tag, "for account:", accountId, "with filters:", filters);

    if (!tag) return res.status(400).json({ message: "Tag is required" });
    if (!clients || !Array.isArray(clients) || clients.length === 0) {
      return res.status(400).json({ message: "A valid list of clients is required" });
    }
    if (!filters || typeof filters !== "object") {
      return res.status(400).json({ message: "Filters are required to save segment" });
    }
    if (!accountId) {
      return res.status(400).json({ message: "Account ID is required" });
    }

    // Extract valid client IDs
    const clientIds = clients
      .map(client => (client._id ? client._id.toString() : null))
      .filter(id => id && ObjectId.isValid(id))
      .map(id => new ObjectId(id));

    if (clientIds.length === 0) {
      return res.status(400).json({ message: "No valid client IDs found" });
    }

    // Parsea y traduce los filtros
    const parsedFilters = typeof filters === "string" ? JSON.parse(filters) : filters;
    //Apply translation mapfilters function
    const translatedFilters = mapFilters(parsedFilters);
    console.log("Aplicando filtros:", translatedFilters);

    // 1️⃣ Save Segment Data for Future Cron Job Processing
    await Segment.updateOne(
      { tag, accountId }, // Ensure only one segment per tag per account
      { $set: { filters: translatedFilters, accountId, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true } // Create if not exists, update if exists
    );

    // 2️⃣ Add Tag to Selected Clients
    const result = await Client.updateMany(
      { _id: { $in: clientIds } },
      { $addToSet: { tags: tag } } // Prevent duplicates
    );

    res.json({
      message: "Tag added to selected clients and segment filters stored",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error adding tag", error);
    res.status(500).json({ message: "Server error", error });
  }
};

exports.getDistinctTags = async (req, res) => {
  console.log("Fetching distinct tags...");
  // Encuentra la cuenta por el email del usuario
  const account = await Account.findOne({ userEmails: req.email }).populate("promotions", "_id systemType");
  if (!account) return res.status(404).json({ error: "Account not found" });
  const accountId = StrToObjectId(account._id);

  try {
    // Get unique tags from the account
    const tags = await Client.distinct("tags", { "addedAccounts.accountId": accountId });

    res.json(tags);
  } catch (error) {
    console.error("Error fetching distinct tags:", error);
    res.status(500).json({ message: "Server error", error });
  }
};
