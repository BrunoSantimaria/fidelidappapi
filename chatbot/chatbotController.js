const { GoogleGenerativeAI } = require("@google/generative-ai");

// Configuración del API Key para Google Generative AI
const api_gemini = process.env.API_GEMINI;

if (!api_gemini) {
  console.error("No se encontró la API_GEMINI en las variables de entorno.");
  throw new Error("API_GEMINI no está configurada.");
}

// Inicializar el cliente de Generative AI
const genAI = new GoogleGenerativeAI(api_gemini);

const system_instruct =
  "Eres un asistente virtual amigable de un restaurante. Usa esta información para responder preguntas sobre los platos, hacer recomendaciones y ayudar a los clientes. " +
  "Si te preguntan por el plato del día, recomienda uno de los platos principales al azar. Si te preguntan por ingredientes específicos o información que no está en el menú, " +
  "indica amablemente que solo puedes proporcionar la información que está en el menú. Mantén las respuestas concisas y amigables. Responde en español y refiriendote por el nombre.";

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-8b",
  systemInstruction: system_instruct,
});

/**
 * Generar una respuesta del chatbot utilizando Google Generative AI.
 */
exports.generateResponse = async (req, res) => {
  try {
    const { client_data, message, info } = req.body;

    // Validar los campos requeridos
    if (!client_data || !message) {
      return res.status(400).json({
        error: "Faltan datos necesarios en la solicitud. Asegúrate de incluir 'client_data' y 'message'.",
      });
    }

    // Opcionalmente incluir el menú si está disponible
    const client_data_json = JSON.stringify(client_data);
    const menu_json = info?.menu ? JSON.stringify(info.menu) : "Menú no disponible.";

    const prompt = `${message}\nInformación del cliente: ${client_data_json}\nMenú: ${menu_json}`;

    console.log("🔹 Generando respuesta con el prompt:", prompt);

    // Generar contenido utilizando el modelo
    const result = await model.generateContent(prompt);

    // Log completo para depuración
    console.log("Respuesta completa de la API:", JSON.stringify(result, null, 2));

    // Verificar si la estructura de la respuesta es válida
    if (!result || !result.response || !result.response.candidates || result.response.candidates.length === 0) {
      console.error("La API no devolvió candidatos válidos.");
      return res.status(500).json({
        error: "No se pudo generar una respuesta válida desde el modelo.",
      });
    }

    // Llamar a la función `.text()` para obtener el contenido generado
    const responseText = await result.response.text();

    return res.status(200).json({ response: responseText });
  } catch (error) {
    console.error("Error generando la respuesta del chatbot:", error);
    return res.status(500).json({
      error: "Ocurrió un error al generar la respuesta del chatbot.",
      details: error.message,
    });
  }
};
