// eventController.js

let accounts = (exports.getEvents = function (req, res) {
  const { accountId } = req.params;
  console.log(`Cliente con ID ${accountId} conectado.`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const newClient = { id: accountId, res };
  accounts.push(newClient);
  console.log(accounts);

  // Cerrar conexión cuando el cliente se desconecta
  req.on("close", () => {
    accounts = accounts?.filter((client) => client.id !== accountId);
    console.log(`Cliente con ID ${accountId} desconectado.`);
  });
});

exports.sendSSEMessageToClient = function (accountId, data) {
  console.log("Enviando mensaje a cliente...");

  const client = accounts.find((client) => client.id === String(accountId));

  if (client) {
    console.log(`Enviando datos a cliente: ${JSON.stringify(data)}`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  } else {
    console.log(`Cliente con ID ${accountId} no encontrado.`);
  }
};
