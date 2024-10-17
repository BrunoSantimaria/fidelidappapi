const Plan = require("./Plans.model"); // Asegúrate de ajustar la ruta según tu estructura de archivos
const jwt = require("jsonwebtoken");

// Crear un nuevo plan
exports.createPlan = async (req, res) => {
  // Extract the user ID from the JWT token in the request headers
  let token = req.headers.authorization?.split(" ")[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const email = decoded.email;

  //check if email is alvaro.villena@gmail.com
  if (email !== "alvaro.villena@gmail.com") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { planStatus, promotionLimit, clientLimit, sendEmail } = req.body;

    // Verificar si el plan ya existe
    const existingPlan = await Plan.findOne({ planStatus });
    if (existingPlan) {
      return res.status(409).json({ error: "El plan ya existe" });
    }

    // Crear un nuevo plan
    const newPlan = new Plan({
      planStatus,
      promotionLimit,
      clientLimit,
      sendEmail,
    });

    // Guardar el plan en la base de datos
    const savedPlan = await newPlan.save();
    res.status(201).json(savedPlan);
  } catch (error) {
    res.status(500).json({ error: "Error al crear el plan" });
    console.error("Error creating plan:", error);
  }
};
