const Agenda = require("./agenda.model");
const Appointment = require("./appointment.model");
const Client = require("../promotions/client.model");
const Account = require("../accounts/Account.model");
const emailSender = require("../utils/emailSender");
const { handlePromotionRedemption } = require("../utils/handlePromotionRedemption");

exports.createAgenda = async (req, res) => {
  const { name, slots, eventDuration, availableDays, availableHours } = req.body;
  const ownerid = req.userid;

  const daysMap = {
    Lunes: 1,
    Martes: 2,
    Miercoles: 3,
    Jueves: 4,
    Viernes: 5,
    Sabado: 6,
    Domingo: 0,
  };

  const daysAsNumbers = availableDays.map((day) => daysMap[day]);

  const sortedHours = availableHours.sort();
  const hoursRanges = [];

  if (sortedHours.length > 0) {
    let start = sortedHours[0];

    for (let i = 1; i < sortedHours.length; i++) {
      const prev = sortedHours[i - 1];
      const current = sortedHours[i];

      if (current !== addOneHour(prev)) {
        hoursRanges.push({
          start,
          end: prev,
        });
        start = current;
      }
    }

    hoursRanges.push({
      start,
      end: sortedHours[sortedHours.length - 1],
    });
  }

  function addOneHour(timeStr) {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes);
    date.setHours(date.getHours() + 1);
    return date.toTimeString().substr(0, 5);
  }

  try {
    // Buscar la cuenta del usuario
    const accountId = await Account.findOne({ owner: ownerid });

    if (!accountId) {
      return res.status(404).json({ error: "Account not found" });
    }

    const newAgenda = new Agenda({
      name,
      slots,
      accountId,
      eventDuration: parseInt(eventDuration),
      availableDays: daysAsNumbers,
      availableHours: hoursRanges,
    });

    const agenda = await newAgenda.save();
    res.status(201).json(agenda);
  } catch (error) {
    console.error("Error creating agenda:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAgendas = async (req, res) => {
  const email = req.email;
  const account = await Account.findOne({ userEmails: email });
  console.log(account);
  console.log(email);
  try {
    const agendas = await Agenda.find({ accountId: account._id });
    res.status(200).json(agendas);
  } catch (error) {
    console.error("Error getting agendas:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAvailableSlots = async (req, res) => {
  const { agendaId } = req.params;

  if (!agendaId) {
    return res.status(400).json({ error: "Agenda ID is required" });
  }

  try {
    // Encuentra la agenda
    const agenda = await Agenda.findById(agendaId);
    if (!agenda) {
      return res.status(404).json({ error: "Agenda not found" });
    }

    // Obtiene todas las citas para esta agenda que no esten cancledaos, statut != cancelled
    const appointments = await Appointment.find({ agendaId: agendaId }).where("status").ne("Cancelled");

    const availableSlotsByDay = {};
    const currentUtcDate = new Date();
    const userOffset = new Date().getTimezoneOffset() * 60000; // Desplazamiento de la zona horaria del usuario en milisegundos
    const currentDate = new Date(currentUtcDate.getTime() - userOffset);

    const endDate = new Date();
    endDate.setDate(currentDate.getDate() + 7); // Establece la fecha de finalización a 7 días desde hoy
    let i = 0;

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay(); // Obtiene el día de la semana actual
      const dateString = currentDate.toISOString().split("T")[0]; // Formatea la fecha como YYYY-MM-DD

      if (agenda.availableDays.includes(dayOfWeek)) {
        // Verifica si el día está disponible
        if (!availableSlotsByDay[dateString]) {
          availableSlotsByDay[dateString] = []; // Inicializa la matriz para el día
        }

        for (let time of agenda.availableHours) {
          const startTime = new Date(`${dateString}T${time.start}:00`);
          const endTime = new Date(`${dateString}T${time.end}:00`);

          // Convierte las horas de UTC a local restando el desplazamiento del usuario
          startTime.setTime(startTime.getTime() - userOffset);
          endTime.setTime(endTime.getTime() - userOffset);

          // Genera intervalos dentro del rango de tiempo disponible
          let slotStartTime = new Date(startTime);
          while (slotStartTime.getTime() + agenda.eventDuration * 60000 <= endTime.getTime()) {
            const slotEndTime = new Date(slotStartTime.getTime() + agenda.eventDuration * 60000);

            if (slotStartTime > currentDate - i * 86400000) {
              // Solo incluye intervalos futuros
              // Calcula cuántas citas están reservadas para este intervalo de tiempo
              const bookedSlotsCount = appointments.filter((appointment) => appointment.startTime.getTime() === slotStartTime.getTime()).length;

              // Calcula los slots restantes
              const remainingSlots = Math.max(agenda.slots - bookedSlotsCount, 0);

              // Agrega el intervalo con los slots restantes
              if (remainingSlots > 0) {
                availableSlotsByDay[dateString].push({
                  startTime: slotStartTime,
                  endTime: slotEndTime,
                  remainingSlots: remainingSlots,
                });
              }
            }

            // Mueve al siguiente intervalo
            slotStartTime = new Date(slotStartTime.getTime() + agenda.eventDuration * 60000);
          }
        }
      }
      // Mueve al siguiente día
      currentDate.setDate(currentDate.getDate() + 1);
      i++;
    }

    res.status(200).json({ name: agenda.name, description: agenda.description, availableSlotsByDay });
  } catch (error) {
    console.error("Error getting available slots:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.createAppointment = async (req, res) => {
  const { agendaId, clientEmail, startTime } = req.body;

  if (!agendaId || !clientEmail || !startTime) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // Verificar que la agenda exista
    const agenda = await Agenda.findById(agendaId).populate({ path: "accountId", populate: { path: "owner", select: "email" } });
    if (!agenda) {
      return res.status(404).json({ error: "Agenda not found" });
    }

    // Verificar que el cliente exista, si no existe crearlo
    let clientId = await Client.findOne({ email: clientEmail });
    if (!clientId) {
      const client = new Client({ email: clientEmail });
      await client.save();
      clientId = client._id;
    }

    // Crear la cita
    const appointment = new Appointment({
      agendaId,
      clientId,
      startTime: new Date(startTime),
      endTime: new Date(startTime) + agenda.eventDuration * 60000,
    });

    await appointment.save();

    // Enviar correos electrónicos
    const appointmentDetails = `
         Detalles de la Cita
         
         Fecha: ${startTime.split(":00.000")[0]} 
         Duración: ${agenda.eventDuration} minutes 
     `;

    const confirmationLink = process.env.BASE_URL + `/agenda/confirm/${appointment._id}`;
    const cancellationLink = process.env.BASE_URL + `/agenda/cancel/${appointment._id}`;

    const emailContent = `
         ${appointmentDetails}
        
        Por favor, confirma esta cita en el siguiente link:
        
        <a href="${confirmationLink}" class="button confirm">Confirmar Cita</a>
        
        Si no podrás asistir, puedes cancelarla en el siguiente link:
        
        <a href="${cancellationLink}" class="button cancel">Cancelar Cita</a>
        
     `;

    // Email to the owner
    await emailSender.sendAgendaEmail({
      to: agenda.accountId.owner.email,
      subject: "Nueva Cita Agendada",
      header: "Felicidades, tienes una nueva reserva!",
      text: emailContent,
    });

    // Email to the client
    await emailSender.sendAgendaEmail({
      to: clientEmail,
      subject: "Nueva Cita Agendada",
      header: "Felicidades, tienes una nueva reserva!",
      text: emailContent,
    });

    res.status(201).json({ message: "Appointment created successfully", appointment });
  } catch (error) {
    console.error("Error creating appointment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getExistingAppointments = async (req, res) => {
  const { agendaId } = req.params;
  const userEmail = req.email;

  try {
    // Busca la agenda por ID y popula la cuenta asociada
    const AppointmentAgenda = await Agenda.find({ _id: agendaId }).populate("accountId");

    console.log(AppointmentAgenda);

    // Asegúrate de que AppointmentAgenda tiene al menos un elemento
    if (!AppointmentAgenda.length) {
      return res.status(404).json({ error: "No se encontró ninguna agenda" });
    }

    // Accede al primer elemento del array
    const agenda = AppointmentAgenda[0];

    // Asegúrate de que accountId y userEmails existan antes de intentar acceder a ellos
    if (!agenda.accountId || !agenda.accountId.userEmails) {
      return res.status(400).json({ error: "No se pudo encontrar la información de la cuenta asociada a la agenda" });
    }

    // Verifica si el email del usuario está en userEmails
    if (!agenda.accountId.userEmails.includes(userEmail)) {
      return res.status(401).json({ error: "Usuario no autorizado para ver la agenda" });
    }
  } catch (error) {
    console.error("Error validating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }

  try {
    // Ordena las citas por hora de inicio
    const appointments = await Appointment.find({ agendaId }).populate("clientId", "email").sort({ startTime: 1 });

    res.status(200).json({ appointments });
  } catch (error) {
    console.error("Error fetching existing appointments:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteAgenda = async (req, res) => {
  const { agendaId } = req.params;
  try {
    const agenda = await Agenda.findByIdAndDelete(agendaId);
    if (!agenda) {
      return res.status(404).json({ error: "Agenda not found" });
    }
    res.status(200).json({ message: "Agenda deleted successfully", agenda });
  } catch (error) {
    console.error("Error deleting agenda:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.cancelAppointment = async (req, res) => {
  const { appointmentId } = req.params;

  try {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    //Change Status to cancelled
    appointment.status = "Cancelled";
    await appointment.save();

    res.status(200).json({ message: "Appointment cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling appointment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.confirmAppointment = async (req, res) => {
  const { appointmentId } = req.params;
  try {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    //Change Status to confirmed
    appointment.status = "Confirmed";
    await appointment.save();
    res.status(200).json({ message: "Appointment confirmed successfully" });
  } catch (error) {
    console.error("Error confirming appointment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.completeAppointment = async (req, res) => {
  const { appointmentId } = req.params;
  try {
    const appointment = await Appointment.findById(appointmentId).populate("clientId");
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    console.log("Appointment:", appointment);

    appointment.status = "Completed";
    await appointment.save();

    const client = appointment.clientId;

    // Para el client a handlePromotionRedemption para aplicar la logica a cada promocion del cliente.
    await handlePromotionRedemption(client);

    res.status(200).json({
      message: "Appointment completed and visits redeemed successfully",
    });
  } catch (error) {
    console.error("Error completing appointment:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.noShowAppointment = async (req, res) => {
  const { appointmentId } = req.params;
  try {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    //Change Status to no show
    appointment.status = "No Show";
    await appointment.save();
    res.status(200).json({ message: "Appointment no show successfully" });
  } catch (error) {
    console.error("Error no showing appointment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
