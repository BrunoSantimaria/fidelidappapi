require('dotenv').config(); // Cargar variables de entorno
const express = require("express");
const router = express.Router();

const accountSid = process.env.SG_ACCOUNTSID;
const authToken = process.env.SG_AUTHTOKEN;

const client = require('twilio')(accountSid, authToken);

router.post("/", async (req, res) => {
    console.log('Correo recibido en leadsemailparser');

    //const { from, subject, text } = req.body;

    try {
        client.messages
            .create({
                from: 'whatsapp:+14155238886',
                contentSid: 'HXb5b62575e6e4ff6129ad7c8efe1f983e',
                contentVariables: '{"1":"12/1","2":"3pm"}',
                to: 'whatsapp:+56996706983'
            })

        res.status(200).send('Lead procesado y notificación enviada');
    } catch (error) {
        console.error('Error procesando el lead:', error);
        res.status(500).send('Error procesando el lead');
    }


});


module.exports = router;