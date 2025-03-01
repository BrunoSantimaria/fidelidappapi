const { GoogleGenerativeAI } = require("@google/generative-ai");
const Redis = require("ioredis");

const redis = new Redis();
console.log("⭕ Conectado a Redis");

//redis.set("user_contexts", JSON.stringify({}));  // Guarda como JSON
// Inicializar estructura en Redis si no existe
redis.exists("user_contexts").then((exists) => {
  if (!exists) {
    redis.set("user_contexts", JSON.stringify({}));  // Guarda como JSON
    console.log("🔹 Se creó el objeto de contextos de usuarios en Redis.");
  }
});

// Obtener contextos almacenados
redis.get("user_contexts").then((result) => {
  console.log("🔹 Contextos de usuarios en Redis:", result ? JSON.parse(result) : {});
});

// Configuración del API Key para Google Generative AI
const api_gemini = process.env.API_GEMINI;
const MODEL_GEMINI = "gemini-1.5-flash";

if (!api_gemini) {
  console.error("No se encontró el API_GEMINI en las variables de entorno.");
  throw new Error("API_GEMINI no está configurada.");
}

// Inicializar el cliente de Generative AI
const genAI = new GoogleGenerativeAI(api_gemini);

const system_instruct =
  "Eres un garzón virtual amigable de un restaurante. No saludes a cada rato. Usa la información del contenido para responder. No inventes platos que no existen. Si piden el plato del día o si pide recomendación, responde con un plato al azar que esté disponible. " + 
  "En caso de consultar cómo sumar puntos, menciona la opción de escanear el código QR al momento de pagar la cuenta.";

const model = genAI.getGenerativeModel({
  model: MODEL_GEMINI,
  systemInstruction: system_instruct,
});

console.log("🚀 El modelo de Google Generative AI está listo para generar respuestas.");

// Función para obtener y limpiar contextos inactivos
async function cleanInactiveContexts() {
  const userContextsStr = await redis.get("user_contexts");
  const userContexts = userContextsStr ? JSON.parse(userContextsStr) : {};
  const now = Date.now();
  const inactivityThreshold = 30 * 60 * 1000;  // 30 minutos en milisegundos

  // Iterar a través de los contextos de usuario y eliminar los inactivos
  for (const [userId, userContext] of Object.entries(userContexts)) {
    const lastInteraction = userContext.lastInteraction;
    if (now - lastInteraction > inactivityThreshold) {
      delete userContexts[userId];  // Eliminar contexto inactivo
    }
  }

  // Guardar los contextos actualizados
  await redis.set("user_contexts", JSON.stringify(userContexts));
  console.log("🔹 Se limpiaron los contextos inactivos de los usuarios.");
}

exports.initChat = async (req, res) => {
  const { client_data, info } = req.body;

  try {
    // Limpiar contextos inactivos antes de iniciar
    await cleanInactiveContexts();

    // Crear contexto del usuario
    const userContext = {
      data_client: client_data,
      menu: info.menu,
      promotions: info.promotions,
      historials: [],
      minPointValue: info.minPointValue,
      lastInteraction: Date.now(),  // Guardar la fecha de la última interacción
    };

    // Obtener contexto de usuarios en Redis
    const userContextsStr = await redis.get("user_contexts");
    const userContexts = userContextsStr ? JSON.parse(userContextsStr) : {};

    // Usar ID del cliente o generar uno nuevo
    const userId = client_data?.email || `user_${Date.now()}`;
    userContexts[userId] = userContext;

    // Guardar contexto en Redis
    await redis.set("user_contexts", JSON.stringify(userContexts));

    // Respuesta al usuario
    const name = client_data?.name || "cliente";

    const prompt = `Saluda al cliente y ofrécele ayuda. Puedes usar el nombre del cliente si está disponible. ` + name;
    // Generar contenido utilizando el modelo
    const result = await model.generateContent(prompt);

    let respuesta = result.response.text();

    userContext.historials.push({
      message: respuesta,
      emitter: "model",
    });

    userContexts[userId] = userContext;
    console.log("🔹 Contexto de usuario:", userContexts[userId]);

    return res.status(200).json({ response: respuesta, id_chat: userId });
  } catch (error) {
    console.error("Error al inicializar el chatbot:", error);
    return res.status(500).json({
      error: "Ocurrió un error al inicializar el chatbot.",
      details: error.message,
    });
  }
};

exports.generateResponse = async (req, res) => {
  try {
    const { idChat, message } = req.body;

    // Obtener contexto de usuarios en Redis
    const userContextsStr = await redis.get("user_contexts");
    const userContexts = userContextsStr ? JSON.parse(userContextsStr) : {};
    const userContext = userContexts[idChat];

    if (!userContext) {
      console.error("No se encontró el contexto del usuario:", idChat);
      return res.status(404).json({
        error: "No se encontró el contexto del usuario.",
      });
    }

    const { data_client, menu, promotions, historials } = userContext;

    // Actualizar la fecha de la última interacción
    userContext.lastInteraction = Date.now();

    const prompt = `${message}\nInformación del cliente: ${JSON.stringify(data_client)}\nMenú: ${JSON.stringify(menu)}\nPromociones: ${JSON.stringify(promotions)}`;

    let contents = []
    for (let i = 0; i < historials.length; i++) {
      contents.push({
        role: historials[i].emitter === "user" ? "user" : "model",
        parts: [
          {
            text: historials[i].message,
          }
        ],
      })
    }

    const result = await model.generateContent(prompt, {
      contents: contents,
    });

    // Verificar si la estructura de la respuesta es válida
    if (!result || !result.response || !result.response.candidates || result.response.candidates.length === 0) {
      console.error("La API no devolvió candidatos válidos.");
      return res.status(500).json({
        error: "No se pudo generar una respuesta válida desde el modelo.",
      });
    }

    // Llamar a la función `.text()` para obtener el contenido generado
    const responseText = await result.response.text();

    historials.push({
      message: message,
      emitter: "user",
    });
    historials.push({
      message: responseText,
      emitter: "model",
    });

    // Guardar contexto en Redis
    userContexts[idChat] = userContext;
    await redis.set("user_contexts", JSON.stringify(userContexts));

    return res.status(200).json({ response: responseText });
  } catch (error) {
    console.error("Error generando la respuesta del chatbot:", error);
    return res.status(500).json({
      error: "Ocurrió un error al generar la respuesta del chatbot.",
      details: error.message,
    });
  }
};
