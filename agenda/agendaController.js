// controllers/agendaController.ts
const Agenda = require("./agenda.model");
const Appointment = require("./appointment.model");
const { startOfDay, endOfDay } = require("date-fns");
const { generateUniqueLink } = require("../utils/generateUniqueLink");
const mongoose = require("mongoose");
const { logAction } = require("../logger/logger");
const { sendStatusChangeEmails, sendAppointmentRequestEmails } = require("./agendaMailing");
const Client = require("../promotions/client.model");
const Account = require("../accounts/Account.model.js");

const createAgenda = async (req, res) => {
  try {
    const { name, description, type, recurringConfig, specialDates, duration, slots, accountId, requiresCapacity, way, virtualLink } = req.body;

    const uniqueLink = generateUniqueLink();

    const agendaData = {
      accountId,
      name,
      description,
      duration,
      slots,
      uniqueLink,
      type: type || "recurring",
      requiresCapacity,
      way: way || "ambas",
      virtualLink: virtualLink || "",
    };

    if (type === "recurring" && recurringConfig) {
      agendaData.recurringConfig = recurringConfig;
    } else if (type === "special" && specialDates) {
      agendaData.specialDates = specialDates;
    }
    logAction("createAgenda", agendaData, req.user);
    const agenda = await Agenda.create(agendaData);
    res.status(201).json(agenda);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createAppointment = async (req, res) => {
  try {
    const { agendaId, startTime, endTime, clientName, clientEmail, clientPhone, notes, numberOfPeople } = req.body;
    console.log("Creando cita:", req.body);

    // Verificar si el agendaId es un ObjectId válido
    const isValidObjectId = mongoose.Types.ObjectId.isValid(agendaId);

    // Buscar la agenda por ID o por uniqueLink
    let agenda;
    if (isValidObjectId) {
      agenda = await Agenda.findById(agendaId);
    } else {
      agenda = await Agenda.findOne({ uniqueLink: agendaId });
    }

    if (!agenda) {
      return res.status(404).json({ message: "Agenda no encontrada" });
    }

    // Tomar el accountId de la agenda
    const accountId = agenda.accountId;
    addClientToAccount(accountId, clientName, clientEmail, clientPhone);

    // Verificar si el horario ya está ocupado y la capacidad disponible
    const existingAppointments = await Appointment.find({
      agendaId: agenda._id,
      startTime: { $lte: endTime },
      endTime: { $gte: startTime },
    });

    if (agenda.requiresCapacity) {
      // Si requiere capacidad, verificamos el total de personas en ese horario
      const totalPeopleInSlot = existingAppointments.reduce((sum, app) => sum + app.numberOfPeople, 0);
      if (totalPeopleInSlot + numberOfPeople > agenda.slots) {
        return res.status(400).json({ message: "No hay suficiente capacidad disponible para este horario" });
      }
    } else {
      // Si no requiere capacidad, solo permitimos una cita por horario
      if (existingAppointments.length > 0) {
        return res.status(400).json({ message: "El horario seleccionado ya no está disponible" });
      }
    }

    // Crear la cita
    const appointment = await Appointment.create({
      agendaId: agenda._id,
      startTime,
      endTime,
      clientName,
      clientEmail,
      clientPhone,
      notes,
      numberOfPeople: agenda.requiresCapacity ? numberOfPeople : 1,
      status: "pending",
      way: agenda.way,
      virtualLink: agenda.way === "virtual" ? virtualLink : "",
    });

    // Enviar correos de notificación
    await sendAppointmentRequestEmails(appointment);

    res.status(201).json(appointment);
  } catch (error) {
    console.error("Error al crear la cita:", error);
    res.status(500).json({ message: error.message });
  }
};

const addClientToAccount = async (accountId, name, email, phoneNumber) => {
  try {
    if (!email) {
      throw new Error("El email es obligatorio para identificar al cliente.");
    }

    // Buscar si el cliente ya existe
    let client = await Client.findOne({ email });

    if (!client) {
      // Si el cliente no existe, crearlo
      client = new Client({
        name,
        email,
        phoneNumber,
        addedAccounts: [{ accountId }],
      });

      await client.save();
      console.log("Cliente creado y agregado desde la agenda a la cuenta:", client);
    } else {
      // Si el cliente ya existe, verificar si está en la cuenta
      const isAlreadyInAccount = client.addedAccounts.some((acc) => acc.accountId.toString() === accountId.toString());

      if (!isAlreadyInAccount) {
        client.addedAccounts.push({ accountId });
        await client.save();
        console.log("Cliente existente agregado a la cuenta.");
      } else {
        console.log("El cliente ya está en la cuenta.");
      }
    }

    // Agregar cliente a la cuenta en el modelo Account
    const account = await Account.findById(accountId);
    if (!account) {
      throw new Error("La cuenta no existe.");
    }

    const isClientInAccount = account.clients.some((c) => c.email === email);

    if (!isClientInAccount) {
      account.clients.push({
        id: client._id,
        name: client.name,
        email: client.email,
        phoneNumber: client.phoneNumber,
      });

      await account.save();
      console.log("Cliente agregado en la cuenta correctamente.");
    }
  } catch (error) {
    console.error("Error al agregar el cliente a la cuenta:", error);
  }
};

const getAccountAppointments = async (req, res) => {
  try {
    const { accountId } = req.params;
    const agendas = await Agenda.find({ accountId });
    const currentDate = new Date();

    // Obtener citas y agruparlas por agenda
    const appointmentsByAgenda = [];
    let totalAppointments = 0;
    let completedAppointments = 0;
    let pendingAppointments = 0;

    for (const agenda of agendas) {
      const appointments = await Appointment.find({
        agendaId: agenda._id,
      }).lean();

      // Procesar las citas de esta agenda
      const processedAppointments = await Promise.all(
        appointments.map(async (app) => {
          const appointmentEndTime = new Date(app.endTime);
          const isCompleted = appointmentEndTime < currentDate;

          // Actualizar el estado en la base de datos si está completada
          if (isCompleted && app.status !== "completed") {
            await Appointment.findByIdAndUpdate(app._id, { status: "completed" });
          }

          // Actualizar contadores
          totalAppointments++;
          if (isCompleted) {
            completedAppointments++;
          } else {
            pendingAppointments++;
          }

          // Mantener los estados existentes o asignar completed/pending según corresponda
          return {
            ...app,
            status: isCompleted ? "completed" : ["confirmed", "cancelled", "rejected"].includes(app.status) ? app.status : "pending",
          };
        })
      );

      appointmentsByAgenda.push({
        agendaId: agenda._id,
        agendaName: agenda.name,
        appointments: processedAppointments,
      });
    }

    // Construir respuesta con métricas y citas agrupadas
    const response = {
      metrics: {
        total: totalAppointments,
        completed: completedAppointments,
        pending: pendingAppointments,
      },
      appointmentsByAgenda,
    };

    res.json(response);
  } catch (error) {
    console.error("Error al obtener las citas:", error);
    res.status(500).json({ message: error.message });
  }
};
const getAccountAgendas = async (req, res) => {
  try {
    const { accountId } = req.params;
    const agendas = await Agenda.find({ accountId });
    res.json(agendas);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAvailableSlots = async (req, res) => {
  try {
    const { date } = req.query;
    const { agendaId } = req.params;

    const isValidObjectId = mongoose.Types.ObjectId.isValid(agendaId);

    let agenda;
    if (isValidObjectId) {
      agenda = await Agenda.findById(agendaId);
    } else {
      agenda = await Agenda.findOne({ uniqueLink: agendaId });
    }

    if (!agenda) {
      return res.status(404).json({ message: "Agenda no encontrada" });
    }

    // Devolver la agenda completa junto con los slots disponibles
    res.json({
      availableSlotsByDay: {}, // Mantener para compatibilidad
      name: agenda.name,
      description: agenda.description,
      type: agenda.type,
      requiresCapacity: agenda.requiresCapacity,
      recurringConfig: agenda.recurringConfig,
      uniqueLink: agenda.uniqueLink,
    });
  } catch (error) {
    console.error("Error en getAvailableSlots:", error);
    res.status(500).json({ message: error.message });
  }
};

const getAgendaAppointments = async (req, res) => {
  try {
    const { agendaId } = req.params;

    // Verificar si el agendaId es un ObjectId válido
    const isValidObjectId = mongoose.Types.ObjectId.isValid(agendaId);

    let agenda;
    if (isValidObjectId) {
      agenda = await Agenda.findById(agendaId);
    } else {
      agenda = await Agenda.findOne({ uniqueLink: agendaId });
    }

    if (!agenda) {
      return res.status(404).json({ message: "Agenda no encontrada" });
    }

    // Obtener todas las citas de la agenda usando el _id sin populate
    const appointments = await Appointment.find({ agendaId: agenda._id }).sort({ startTime: 1 });

    const formattedAppointments = appointments.map((appointment) => ({
      _id: appointment._id,
      clientName: appointment.clientName || "Cliente",
      clientEmail: appointment.clientEmail,
      startTime: appointment.startTime,
      endTime: appointment.endTime,
      status: appointment.status,
      notes: appointment.notes,
      numberOfPeople: appointment.numberOfPeople,
    }));

    res.json(formattedAppointments);
  } catch (error) {
    console.error("Error al obtener las citas:", error);
    res.status(500).json({
      message: "Error al obtener las citas",
      error: error.message,
    });
  }
};

const getClientAppointments = async (req, res) => {
  try {
    const { agendaId } = req.params;
    const { clientEmail } = req.query;

    const agenda = await Agenda.findById(agendaId);
    if (!agenda) {
      return res.status(404).json({ message: "Agenda no encontrada" });
    }

    const appointments = await Appointment.find({
      agendaId,
      clientEmail,
      startTime: { $gte: new Date() },
    }).sort({ startTime: 1 });

    res.json(appointments);
  } catch (error) {
    console.error("Error al obtener las citas del cliente:", error);
    res.status(500).json({ message: error.message });
  }
};
const confirmAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await Appointment.findByIdAndUpdate(appointmentId, { status: "confirmed" }, { new: true });

    if (!appointment) {
      return res.status(404).json({ message: "Cita no encontrada" });
    }

    await sendStatusChangeEmails(appointment, "confirmed");

    res.json({ message: "Cita confirmada correctamente", appointment });
  } catch (error) {
    console.error("Error al confirmar la cita:", error);
    res.status(500).json({ message: error.message });
  }
};
const cancelAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await Appointment.findByIdAndUpdate(appointmentId, { status: "cancelled" }, { new: true });

    if (!appointment) {
      return res.status(404).json({ message: "Cita no encontrada" });
    }

    await sendStatusChangeEmails(appointment, "cancelled");

    res.json({ message: "Cita cancelada correctamente", appointment });
  } catch (error) {
    console.error("Error al cancelar la cita:", error);
    res.status(500).json({ message: error.message });
  }
};
const rejectAppointment = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const appointment = await Appointment.findByIdAndUpdate(appointmentId, { status: "rejected" }, { new: true });

    if (!appointment) {
      return res.status(404).json({ message: "Cita no encontrada" });
    }

    await sendStatusChangeEmails(appointment, "rejected");

    res.json({ message: "Cita rechazada correctamente", appointment });
  } catch (error) {
    console.error("Error al rechazar la cita:", error);
    res.status(500).json({ message: error.message });
  }
};
const pauseAgenda = async (req, res) => {
  try {
    const { agendaId } = req.params;
    await Agenda.findByIdAndUpdate(agendaId, { isPaused: true });
    res.status(204).json({ message: "Agenda pausada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
const disableAgenda = async (req, res) => {
  try {
    const { agendaId } = req.params;
    const { disabledReason } = req.body;

    const agenda = await Agenda.findByIdAndUpdate(
      agendaId,
      {
        isDisabled: true,
        disabledReason,
        disabledAt: new Date(),
      },
      { new: true }
    );

    if (!agenda) {
      return res.status(404).json({ message: "Agenda no encontrada" });
    }

    // Opcional: Cancelar todas las citas pendientes
    const pendingAppointments = await Appointment.find({
      agendaId,
      status: "pending",
      startTime: { $gt: new Date() },
    });

    for (const appointment of pendingAppointments) {
      appointment.status = "cancelled";
      appointment.cancellationReason = "Agenda deshabilitada";
      await appointment.save();
      await sendStatusChangeEmails(appointment, "cancelled");
    }

    res.json({
      message: "Agenda deshabilitada correctamente",
      agenda,
      appointmentsCancelled: pendingAppointments.length,
    });
  } catch (error) {
    console.error("Error al deshabilitar la agenda:", error);
    res.status(500).json({ message: error.message });
  }
};

const confirmAppointmentByToken = async (req, res) => {
  try {
    console.log(req.body);
    const { token } = req.params;
    const { action } = req.body; // 'confirm' o 'cancel'

    const appointment = await Appointment.findOne({
      confirmationToken: token,
      confirmationTokenExpires: { $gt: new Date() },
    }).populate("agendaId");

    if (!appointment) {
      return res.status(404).json({
        message: "Token inválido o expirado",
      });
    }

    // Actualizar el estado de la cita
    appointment.status = action === "confirm" ? "confirmed" : "cancelled";
    appointment.confirmationToken = undefined;
    appointment.confirmationTokenExpires = undefined;

    if (action === "cancel") {
      appointment.cancellationReason = "Cancelado por el cliente";
    }

    await appointment.save();

    // Enviar correos de notificación
    await sendStatusChangeEmails(appointment, appointment.status);

    res.json({
      message: `Cita ${action === "confirm" ? "confirmada" : "cancelada"} correctamente`,
      appointment,
    });
  } catch (error) {
    console.error("Error en la confirmación de la cita:", error);
    res.status(500).json({ message: error.message });
  }
};

const cancelAppointmentByToken = async (req, res) => {
  try {
    const { token } = req.params;

    const appointment = await Appointment.findOne({
      cancellationToken: token,
      status: "confirmed",
    }).populate("agendaId");

    if (!appointment) {
      return res.status(404).json({
        message: "Token inválido o cita no encontrada",
      });
    }

    // Verificar si la cita puede ser cancelada (24 horas antes)
    if (!appointment.isCancellable()) {
      return res.status(400).json({
        message: "No es posible cancelar la cita con menos de 24 horas de anticipación",
      });
    }

    // Actualizar el estado de la cita
    appointment.status = "cancelled";
    appointment.cancellationReason = "Cancelado por el cliente";
    await appointment.save();

    // Enviar correos de notificación
    await sendStatusChangeEmails(appointment, "cancelled");

    res.json({
      message: "Cita cancelada correctamente",
      appointment,
    });
  } catch (error) {
    console.error("Error en la cancelación de la cita:", error);
    res.status(500).json({ message: error.message });
  }
};

const getPendingAppointmentsCount = async (req, res) => {
  try {
    const { email } = req.query;
    const pendingAppointments = await Appointment.countDocuments({
      clientEmail: email,
      status: "pending",
      startTime: { $gte: new Date() },
    });

    console.log("pendingAppointments", pendingAppointments);
    res.json({ count: pendingAppointments });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createAgenda,
  getAvailableSlots,
  getAccountAgendas,
  getAgendaAppointments,
  createAppointment,
  cancelAppointment,
  pauseAgenda,
  getClientAppointments,
  getAccountAppointments,
  confirmAppointment,
  rejectAppointment,
  disableAgenda,
  confirmAppointmentByToken,
  cancelAppointmentByToken,
  getPendingAppointmentsCount,
};
