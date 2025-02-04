const Client = require("../promotions/client.model");
const moment = require('moment-timezone');
// 

const mapFilters = async (filters) => {
    //Translate filters
    const translationMap = {
        'Ninguna': 'none',
        'Registro': 'register',
        'Sumó Puntos': 'earned',
        'Canjeó Puntos': 'reward_redeemed',
        'Canjeó Promoción': 'visit',
        'Evaluó el Servicio': 'rating_given',
        'Lunes': 'Monday',
        'Martes': 'Tuesday',
        'Miércoles': 'Wednesday',
        'Jueves': 'Thursday',
        'Viernes': 'Friday',
        'Sábado': 'Saturday',
        'Domingo': 'Sunday'
    };


    return {
        ...filters,
        activityType: filters.activityType?.map(activity => translationMap[activity] || activity),
        availableDays: filters.availableDays?.map(day => translationMap[day] || day),
        pointsRange: {
            min: filters.pointsRange?.min && parseInt(filters.pointsRange.min, 10),
            max: filters.pointsRange?.max && parseInt(filters.pointsRange.max, 10)
        },
        dateRange: {
            start: filters.dateRange?.start ? new Date(filters.dateRange.start) : null,
            end: filters.dateRange?.end ? new Date(filters.dateRange.end) : null
        }
    };
}

const getFilteredClients = async (filters, accountId) => {

    // Filtros
    const dateRange = filters.dateRange || {};
    const availableHours = filters.availableHours || [];
    const activityTypes = filters.activityType || [];


    const pipeline = [
        // 1.- Filtrar clientes por cuenta
        {
            $match: {
                "addedAccounts.accountId": accountId,
                ...(filters.hasPhoneNumber
                    ? { phoneNumber: { $exists: true, $ne: null, $ne: "" } }
                    : { phoneNumber: { $in: [null, ""] } }),

                ...(filters.selectedTags.length > 0 ? { tags: { $in: filters.selectedTags } } : {}),
                email: { $regex: new RegExp(filters.email, "i") },
            },
        },

        // 5️⃣ Proyectar solo los campos necesarios
        {
            $project: {
                name: 1,
                email: 1,
                phoneNumber: 1,
                activities: 1,
                tags: 1,
                addedAccounts: 1,
            },
        },
    ];

    // Ejecutar la agregación
    let filteredClients = await Client.aggregate(pipeline);

    console.log(filteredClients)

    // Exclude "register" and "none" from activityTypes check
    const relevantActivityTypes = activityTypes.filter(type => type !== "register" && type !== "none");

    // 2 Aplicar filtro de actividades en memoria SOLO si hay filtros de actividad (excluyendo "register" y "none")
    if (relevantActivityTypes.length > 0 || activityTypes.includes("register") || activityTypes.includes("none")) {

        filteredClients = filteredClients.filter(client => {
            const activityChecks = [];

            // 3 Check if "none" is selected (Client must have NO activities)
            if (activityTypes.includes("none")) {
                activityChecks.push(client.activities.length === 0);
            }

            // 4 Check if "register" is selected (Client must have registered within the date range)
            if (activityTypes.includes("register")) {
                const registeredAccount = client.addedAccounts.find(acc => acc.accountId.equals(accountId));

                if (registeredAccount) {
                    const registerTimestamp = registeredAccount._id.getTimestamp(); // Extracts creation date from ObjectId
                    const registerDate = new Date(registerTimestamp);

                    // Ajustar el rango de fecha
                    const startDate = dateRange.start ? new Date(dateRange.start) : null;
                    const endDate = dateRange.end ? new Date(dateRange.end) : null;

                    if (endDate) {
                        endDate.setUTCHours(23, 59, 59, 999); // Extender el fin del día a las 23:59:59.999
                    }

                    // Validar si la fecha de registro cae dentro del rango ajustado
                    const isRegisteredWithinRange =
                        (!startDate || registerDate >= startDate) &&
                        (!endDate || registerDate <= endDate);

                    activityChecks.push(isRegisteredWithinRange);
                } else {
                    activityChecks.push(false); // No registered account found
                }
            }

            // 5 Check if the client has at least one matching activity type (excluding "register" & "none")
            if (relevantActivityTypes.length > 0) {
                const hasMatchingActivity = relevantActivityTypes.every(type =>
                    client.activities.some(activity => activity.type === type)
                );
                activityChecks.push(hasMatchingActivity);
            }

            // ✅ Ensure all selected activity filters are satisfied (AND condition)
            return activityChecks.length > 0 && activityChecks.every(check => check);
        });
    }

    let dateFilteredClients = filteredClients;

    // Aplicar filtro de fechas en memoria
    if (relevantActivityTypes.length > 0 && dateRange && (dateRange.start || dateRange.end)) {
        dateFilteredClients = filteredClients.filter(client =>
            Array.isArray(client.activities) && // Ensure activities is an array
            client.activities.some(activity => {
                // Convert activity date to UTC and then to Santiago time
                let activityDate = moment.utc(activity.date).tz('America/Santiago');

                // Keep startDate and endDate in UTC (DO NOT CONVERT TO LOCAL TIMEZONE)
                let startDate = dateRange.start ? moment.utc(dateRange.start).startOf('day') : null;
                let endDate = dateRange.end ? moment.utc(dateRange.end).endOf('day') : null;

                // Check if the activity falls within the date range
                return (!startDate || activityDate.isSameOrAfter(startDate)) &&
                    (!endDate || activityDate.isSameOrBefore(endDate));
            })
        );
    }


    //console.log("Total de clientes encontrados despues del filtro de fechas", dateFilteredClients.length);

    // Aplicar filtro de horas en memoria
    let hourfilteredClients = dateFilteredClients;

    // Convert available hours to numeric hours only (e.g., '20:00' -> 20)
    let availableNumericHours = availableHours.map(hour => parseInt(hour.split(':')[0], 10));

    if (availableNumericHours.length > 0) {
        hourfilteredClients = dateFilteredClients.filter(client =>
            client.activities.some(activity => {
                // Obtener la hora de la actividad (número)
                let activityHour = moment(activity.date)
                    .tz('America/Santiago') // Adjust for Santiago timezone, considering DST
                    .hour(); // Get the hour in the Santiago timezone (DST-aware)

                // Verificar si la hora de la actividad está en las horas disponibles
                return availableNumericHours.includes(activityHour);
            })
        );
    }

    console.log("Total de clientes encontrados para el segmento:", hourfilteredClients.length);

    return hourfilteredClients;

}

module.exports = { mapFilters, getFilteredClients };