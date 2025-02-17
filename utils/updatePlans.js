const mongoose = require("mongoose");
const Plan = require("../plans/Plans.model");

const DB_URI = process.env.DB_URI;

async function updatePlans() {
  try {
    // Conectar a la base de datos
    await mongoose.connect(DB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Actualiza los planes existentes
    const result = await Plan.updateMany({}, [
      {
        $set: {
          promotionLimit: {
            $switch: {
              branches: [
                { case: { $eq: ["$planStatus", "free"] }, then: 1 },
                { case: { $eq: ["$planStatus", "pro"] }, then: 10 },
                { case: { $eq: ["$planStatus", "pro2"] }, then: 10 },
                { case: { $eq: ["$planStatus", "admin"] }, then: 50 },
                { case: { $eq: ["$planStatus", "premium"] }, then: 10 },
              ],
              default: 0,
            },
          },
          emailLimit: {
            $switch: {
              branches: [
                { case: { $eq: ["$planStatus", "free"] }, then: 1000 },
                { case: { $eq: ["$planStatus", "pro"] }, then: 10000 },
                { case: { $eq: ["$planStatus", "pro2"] }, then: 10000 },
                { case: { $eq: ["$planStatus", "admin"] }, then: 50000 },
                { case: { $eq: ["$planStatus", "premium"] }, then: 10000 },
              ],
              default: 0,
            },
          },
          clientLimit: {
            $switch: {
              branches: [
                { case: { $eq: ["$planStatus", "free"] }, then: 250 },
                { case: { $eq: ["$planStatus", "pro"] }, then: null },
                { case: { $eq: ["$planStatus", "pro2"] }, then: null },
                { case: { $eq: ["$planStatus", "admin"] }, then: null },
                { case: { $eq: ["$planStatus", "premium"] }, then: null },
              ],
              default: null,
            },
          },
          sendEmail: true, // Establece sendEmail en true para todos los planes
          updatedAt: new Date(), // Actualiza la fecha de modificación
        },
      },
    ]);

    const existingPlans = await Plan.find({ planStatus: { $in: ["admin", "premium"] } });

    const plansToInsert = [];

    if (!existingPlans.some((plan) => plan.planStatus === "admin")) {
      plansToInsert.push({
        planStatus: "admin",
        promotionLimit: 50,
        emailLimit: 50000,
        clientLimit: null,
        sendEmail: true, // sendEmail en true para el nuevo plan admin
      });
    }

    if (!existingPlans.some((plan) => plan.planStatus === "premium")) {
      plansToInsert.push({
        planStatus: "premium",
        promotionLimit: 10,
        emailLimit: 10000,
        clientLimit: null,
        sendEmail: true, // sendEmail en true para el nuevo plan premium
      });
    }

    // Inserta los nuevos planes si es necesario
    if (plansToInsert.length > 0) {
      const insertResult = await Plan.insertMany(plansToInsert);
      console.log(`${insertResult.length} nuevos planes insertados.`);
    } else {
      console.log("No se necesitan insertar nuevos planes.");
    }
  } catch (error) {
    console.error("Error al actualizar o insertar planes:", error.message);
  }
}

updatePlans();
