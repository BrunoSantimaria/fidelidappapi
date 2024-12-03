const cron = require("node-cron");
const ScheduledEmail = require("../models/ScheduledEmail");
const { emailSenderEditor } = require("../emailSender/emailController");

const processScheduledEmails = async () => {
  console.log(`[${new Date().toISOString()}] Iniciando verificación de emails programados...`);
  try {
    // Buscar emails pendientes
    const emailsToSend = await ScheduledEmail.find({
      status: "pending",
      scheduledFor: { $lte: new Date() },
    }).populate("account");

    for (const scheduledEmail of emailsToSend) {
      try {
        // Marcar el email como "processing"
        scheduledEmail.status = "processing";
        await scheduledEmail.save();

        const mockRequest = {
          email: scheduledEmail.account.userEmails[0],
          body: {
            template: scheduledEmail.template,
            subject: scheduledEmail.subject,
            campaignName: scheduledEmail.subject,
            clients: scheduledEmail.recipients.map((recipient) => ({
              email: recipient.email,
              name: recipient.name,
            })),
          },
          account: scheduledEmail.account,
        };

        // Crear un mock response para capturar la respuesta
        const mockResponse = {
          status: function (statusCode) {
            this.statusCode = statusCode;
            return this;
          },
          json: function (data) {
            this.data = data;
            return this;
          },
        };

        // Ejecutar emailSenderEditor con los datos preparados
        await emailSenderEditor(mockRequest, mockResponse);

        // Si el envío fue exitoso
        if (mockResponse.statusCode === 200) {
          scheduledEmail.status = "sent";
          scheduledEmail.sentAt = new Date();
          scheduledEmail.campaignId = mockResponse.data.campaignId;
        } else {
          throw new Error(`Error en el envío: ${JSON.stringify(mockResponse.data)}`);
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error al procesar email programado ${scheduledEmail._id}:`, error);
        scheduledEmail.status = "failed";
        scheduledEmail.error = error.message;
      } finally {
        // Guardar el estado final del email
        await scheduledEmail.save();
      }
    }

    console.log(`[${new Date().toISOString()}] Finalizada la verificación de emails programados`);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error general al procesar emails programados:`, error);
  }
};

// Crear una instancia del cron job
const scheduledEmailsCron = cron.schedule(
  "* * * * *",
  () => {
    console.log(`[${new Date().toISOString()}] Iniciando tarea CRON de emails programados`);
    processScheduledEmails()
      .then(() => {
        console.log(`[${new Date().toISOString()}] Tarea CRON completada exitosamente`);
      })
      .catch((error) => {
        console.error(`[${new Date().toISOString()}] Error en tarea CRON:`, error);
      });
  },
  {
    scheduled: true,
    timezone: "America/Argentina/Buenos_Aires",
  }
);

// Exportar tanto la función como el cron job
module.exports = {
  processScheduledEmails,
  scheduledEmailsCron,
};
