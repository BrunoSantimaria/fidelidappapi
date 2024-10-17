const express = require('express');
const router = express.Router();

// Importar controladores
const { signUp, signIn, googleSignIn, current, logout, contact } = require('./authController.js');

// Middleware de autenticación
const { verifyToken } = require('../middleware/verifyToken.js');

// Rutas de autenticación
router.post('/signup', signUp);
router.post('/signin', signIn);
router.post('/google-signin', googleSignIn);
router.get('/current',verifyToken, current)
router.get('/logout', logout);
router.post('/contact', contact);

module.exports = router;
