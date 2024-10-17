const cron = require('node-cron');
const Appointment = require('../agenda/appointment.model'); // Ajusta la importación según tu estructura
const Agenda = require('../agenda/agenda.model'); // Ajusta la importación según tu estructura

const { sendEmail } = require('../utils/emailSender'); // Ajusta la importación según tu estructura
const { sendWSPMessage }  = require('./WspIntegration');

const updateAppointmentStatus = async () => {
    const currentUtcDate = new Date();
    const userOffset = new Date().getTimezoneOffset() * 60000; // Desplazamiento de la zona horaria del usuario en milisegundos
    const now = new Date(currentUtcDate.getTime() - userOffset);

    console.log('Updating appointment status...', now);

    try {
        // Encuentra las citas que deben actualizarse
        const appointmentsToUpdate = await Appointment.find({
            status: { $in: ['Scheduled', 'Confirmed'] },
            endTime: { $lt: now }
        }).populate('clientId', 'email');

        if (appointmentsToUpdate.length > 0) {
            // Actualiza el estado de las citas a 'Past'
            await Appointment.updateMany(
                {
                    //status scheduled or confirmed
                    status: { $in: ['Scheduled', 'Confirmed'] },
                    endTime: { $lt: now }
                },
                { $set: { status: 'Past' } }
            );
            console.log('Appointment status updated.');

            // Envía un correo electrónico para cada cita actualizada
            appointmentsToUpdate.forEach(async (appointment) => {
                const AppointmentAgenda = await Agenda.findById(appointment.agendaId).populate({ path: 'accountId', populate: { path: 'owner', select: 'email' } });
                console.log(AppointmentAgenda);
                const completeLink = process.env.BASE_URL + `/agenda/completeAppointment/${appointment._id}`;
                const noShowLink = process.env.BASE_URL + `/agenda/noShowAppointment/${appointment._id}`;


                const OwnerEmail = AppointmentAgenda.accountId.owner.email;
                const subject = 'Appointment Status Update';
                const header = 'Appointment Status Update';

                // Enviar correos electrónicos
                const appointmentDetails = `
                Client: ${appointment.clientId.email} 
                Date: ${appointment.startTime} 
                Duration: ${AppointmentAgenda.eventDuration} minutes 
                `;


                const emailContent = `
                    The status of your appointment has been updated. Details:
                    ${appointmentDetails}

                    Please complete the appointment by clicking the link below:

                    <a href="${completeLink}" class="button confirm">Completar Cita</a>

                    Or if you want to mark it as No Show, click here:

                    <a href="${noShowLink}" class="button cancel">No Show</a>
                `;


                await sendEmail({
                    to: OwnerEmail,
                    subject,
                    header,
                    text: emailContent,
                });
            });
        } else {
            console.log('No appointments needed to be updated.');
        }
    } catch (error) {
        console.error('Error updating appointment status:', error);
    }

    // console.log('Testing Wsp API')

    // try {
    //    // await sendWSPMessage('Hello, this is a test message from Fidelidapp!');
    // } catch (error) {
    //     console.error('Error testing Wsp API:', error);
    // }
};

//cron.schedule('*/5 * * * * *', updateAppointmentStatus); // Cada 5 segundo
cron.schedule('* */30 * * *', updateAppointmentStatus); // Cada 30 minutos

module.exports = { updateAppointmentStatus };
