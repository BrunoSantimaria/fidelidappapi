require('dotenv').config(); // Cargar variables de entorno
const express = require("express");
const router = express.Router();

const accountSid = process.env.SG_ACCOUNTSID;
const authToken = process.env.SG_AUTHTOKEN;

const client = require('twilio')(accountSid, authToken);

router.post("/", async (req, res) => {
    console.log('Correo recibido en leadsemailparser');
    console.log('Req Body:' + req.body);

    try {

        const toAddress = req.body.to; // Store the 'to' address
        const fromAddress = req.body.from;
        const subject = req.body.subject;
        const textMessage = req.body.text;
        const business = toAddress.split('@')[0]; // This will give you "parser.example.com"

        // Define the message template
        const messageToSend = `
        Hola ${business},

        Ha llegado un nuevo formulario de contacto.

        From: ${fromAddress}
        Subject: ${subject}
        Message: ${textMessage}
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


module.exports = router;


