require('dotenv').config(); // Cargar variables de entorno
const express = require("express");
const router = express.Router();
const multer = require("multer");

const accountSid = process.env.SG_ACCOUNTSID;
const authToken = process.env.SG_AUTHTOKEN;

const client = require('twilio')(accountSid, authToken);

const upload = multer(); // Initialize multer without any storage configuration

router.post("/", upload.any(), async (req, res) => {
    console.log('Correo recibido en leadsemailparser');
    console.log('Request Headers:', req.headers);
    console.log('Parsed Body Fields:', req.body);



    try {

        const toAddress = req.body.to; // Store the 'to' address
        const fromAddress = req.body.from;
        const subject = req.body.subject;
        const textMessage = req.body.text;
        const business = toAddress.split('@')[0]; // This will give you "parser.example.com"

        const textContent = req.body || ''; // Asegúrate de que el texto esté aquí

        if (!textContent) {
            console.log('No se encontró texto en el cuerpo del mensaje');
            return res.status(400).send('Cuerpo del mensaje vacío');
        }

        // Define the message template
        const messageToSend = `
        Hola ${business},

        Ha llegado un nuevo formulario de contacto.
        Subject: ${subject}
        Message: ${textContent}
    `;

        console.log('To address:', toAddress);
        console.log('Message:', messageToSend);

        client.messages
            .create({
                from: 'whatsapp:+14155238886',
                //contentSid: 'HX80bd66de6cc4c5e97c2cf0e74ae551a6',
                //contentVariables: '{"1":"Fidelidapp","2":"3pm"}',
                body: messageToSend,
                to: 'whatsapp:+56996706983'
            })
            .then((message) => console.log(message.sid))

        res.status(200).send('Lead procesado y notificación enviada');
    } catch (error) {
        console.error('Error procesando el lead:', error);
        res.status(500).send('Error procesando el lead');
    }

});

const extractFieldsFromText = (text) => {
    const fields = {};

    // Usamos expresiones regulares para buscar cada campo
    const nameMatch = text.match(/--- Nombre ---\s+([\s\S]+?)\s+---/);
    const phoneMatch = text.match(/--- Número de teléfono ---\s+([\s\S]+?)\s+---/);
    const emailMatch = text.match(/--- Email ---\s+([\s\S]+?)\s+---/);
    const companyMatch = text.match(/--- Empresa ---\s+([\s\S]+?)\s+---/);
    const reasonMatch = text.match(/--- ¿Por qué nos contactactas\? ---\s+([\s\S]+?)\s+---/);
    const messageMatch = text.match(/--- Mensaje ---\s+([\s\S]+?)\s+$/);

    // Guardamos los valores extraídos en el objeto fields si existen
    fields.name = nameMatch ? nameMatch[1].trim() : '';
    fields.phone = phoneMatch ? phoneMatch[1].trim() : '';
    fields.email = emailMatch ? emailMatch[1].trim() : '';
    fields.company = companyMatch ? companyMatch[1].trim() : '';
    fields.reason = reasonMatch ? reasonMatch[1].trim() : '';
    fields.message = messageMatch ? messageMatch[1].trim() : '';

    return fields;
};


module.exports = router;


