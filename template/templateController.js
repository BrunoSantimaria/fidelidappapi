const Template = require("./template.model");
const mongoose = require("mongoose");
exports.createTemplate = async (req, res) => {
  try {
    // Verificar que el userId es un ObjectId válido
    if (!mongoose.Types.ObjectId.isValid(req.body.userId)) {
      return res.status(400).json({ error: "userId inválido" });
    }

    const templateData = {
      name: req.body.name,
      design: req.body.design,
      subject: req.body.subject,
      userId: req.body.userId,
    };

    const template = new Template(templateData);
    const savedTemplate = await template.save();

    console.log("Plantilla guardada:", savedTemplate);
    res.status(201).json(savedTemplate);
  } catch (error) {
    console.error("Error al guardar la plantilla:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTemplates = async (req, res) => {
  console.log("getTemplates", req.params);
  try {
    const userId = req.params.userId;
    const objectId = new mongoose.Types.ObjectId(userId);
    console.log(userId);
    const templates = await Template.find({ userId: objectId });
    res.status(200).json(templates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
