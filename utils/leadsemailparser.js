require('dotenv').config(); // Cargar variables de entorno
const express = require("express");
const router = express.Router();
const multer = require("multer");

const accountSid = process.env.SG_ACCOUNTSID;
const authToken = process.env.SG_AUTHTOKEN;

const client = require('twilio')(accountSid, authToken);

const upload = multer(); // Initialize multer without any storage configuration

const extractFieldsFromText = (text) => {
    const fields = {};

    // Normalize newlines and spaces, so we match fields correctly
    const normalizedText = text.replace(/\\n/g, '\n').replace(/\n+/g, ' ').trim();  // Normalize and replace escaped newlines

    const nameMatch = normalizedText.match(/--- Nombre ---\s+([\s\S]+?)\s+---/);
    const phoneMatch = normalizedText.match(/--- Número de teléfono ---\s+([\s\S]+?)\s+---/);
    const emailMatch = normalizedText.match(/--- Email ---\s+([\s\S]+?)\s+---/);
    const companyMatch = normalizedText.match(/--- Empresa ---\s+([\s\S]+?)\s+---/);
    const reasonMatch = normalizedText.match(/--- ¿Por qué nos contactactas\? ---\s+([\s\S]+?)\s+---/);
    const messageMatch = normalizedText.match(/--- Mensaje ---\s+([\s\S]+?)\s+$/);

    fields.name = nameMatch ? nameMatch[1].trim() : '';
    fields.phone = phoneMatch ? phoneMatch[1].trim() : '';
    fields.email = emailMatch ? emailMatch[1].trim() : '';
    fields.company = companyMatch ? companyMatch[1].trim() : '';
    fields.reason = reasonMatch ? reasonMatch[1].trim() : '';
    fields.message = messageMatch ? messageMatch[1].trim() : '';

    return fields;
};

router.post("/", upload.any(), async (req, res) => {
    console.log('Correo recibido en leadsemailparser');
    console.log('Request Headers:', req.headers);
    console.log('Parsed Body Fields:', req.body);

    try {
        const textMessage = req.body.text;

        if (!textMessage) {
            console.log('No se encontró texto en el cuerpo del mensaje');
            return res.status(400).send('Cuerpo del mensaje vacío');
        }

        // Extract and clean fields
        const extractedFields = extractFieldsFromText(textMessage);
        const { name, phone, email, company, reason, message } = extractedFields;

        // Construct message to send
        const messageToSend = `Hola ${name || "usuario"}, Ha llegado un nuevo formulario de contacto. Empresa: ${company || "No especificada"}, Teléfono: ${phone || "No especificado"}, Correo: ${email || "No especificado"}, Razón de contacto: ${reason || "No especificada"}, Mensaje: ${message || "No especificado"}`;

        console.log('Message to send:', messageToSend);

        await client.messages
            .create({
                from: 'whatsapp:+14155238886',
                body: messageToSend,
                to: 'whatsapp:+56996706983'
            })
            .then((message) => console.log('Message SID:', message.sid));

        res.status(200).send('Lead procesado y notificación enviada');
    } catch (error) {
        console.error('Error procesando el lead:', error);
        res.status(500).send('Error procesando el lead');
    }
});

module.exports = router;
