const User = require("./User.model.js");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const Account = require("../accounts/Account.model.js");
const Plan = require("../plans/Plans.model.js");
const Client = require("../promotions/client.model.js");
const log = require("../logger/logger.js");
const { generateQr, sendQrCode } = require("../utils/generateQrKeys.js");
const { sendRegisterEmail, sendVerificationEmail } = require("../utils/emailSender.js");

const axios = require("axios");
const crypto = require("crypto");

// Constantes para mensajes de error
const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: "Credenciales inválidas",
  SERVER_ERROR: "Error interno del servidor",
  MISSING_FIELDS: "Faltan campos obligatorios",
  EMAIL_EXISTS: "El email ya está asociado a una cuenta",
  MISSING_TOKEN: "Token no proporcionado",
  ACCOUNT_NOT_FOUND: "Cuenta no encontrada",
  MISSING_GOOGLE_TOKEN: "Token de Google no proporcionado",
};

// Función auxiliar para generar JWT
const generateToken = (user) => {
  return jwt.sign({ id: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: "30d" });
};

// Función auxiliar para crear cuenta
const createAccount = async (userId, email, name) => {
  const qrCode = await generateQr();
  const account = new Account({
    owner: userId,
    userEmails: [email],
    accountQr: qrCode,
    name: name,
    socialMedia: {
      facebook: "",
      instagram: "",
      whatsapp: "",
      website: "",
    },
    firstEmailMarketingCompleted: false,
  });
  await account.save();
  await sendQrCode(account);
  return account;
};

exports.signIn = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: ERROR_MESSAGES.MISSING_FIELDS });
    }

    const user = await User.findOne({ email });

    // Verificar si el usuario existe y si el email está verificado
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: ERROR_MESSAGES.INVALID_CREDENTIALS });
    }

    // Verificar si el email está verificado
    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Por favor verifica tu correo electrónico antes de iniciar sesión",
        needsVerification: true,
      });
    }

    const token = generateToken(user);
    log.logAction(email, "login", "Login exitoso");
    const account = await Account.findOne({ owner: user._id });

    res.status(200).json({
      token,
      user: {
        email: user.email,
        name: user.name,
        slug: account?.slug || null,
      },
    });
  } catch (error) {
    console.error("Error en signin:", error);
    res.status(500).json({ message: ERROR_MESSAGES.SERVER_ERROR });
  }
};

exports.signUp = async (req, res) => {
  try {
    const { name, email, password, phone, recaptchaToken } = req.body;

    // Verificar que todos los campos requeridos estén presentes
    if (!name || !email || !password || !phone || !recaptchaToken) {
      return res.status(400).json({
        message: "Todos los campos son requeridos, incluyendo la verificación reCAPTCHA",
      });
    }

    // Verificar reCAPTCHA
    try {
      const recaptchaResponse = await axios.post("https://www.google.com/recaptcha/api/siteverify", null, {
        params: {
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: recaptchaToken,
        },
      });

      if (!recaptchaResponse.data.success) {
        return res.status(400).json({
          message: "reCAPTCHA no válido",
          details: recaptchaResponse.data["error-codes"],
        });
      }
    } catch (error) {
      console.error("Error al verificar reCAPTCHA:", error);
      return res.status(400).json({
        message: "Error al verificar reCAPTCHA",
        details: error.message,
      });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: ERROR_MESSAGES.EMAIL_EXISTS });
    }

    // Generar token de verificación
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const tokenExpiration = new Date();
    tokenExpiration.setHours(tokenExpiration.getHours() + 24);

    const user = new User({
      name,
      email,
      password,
      phone,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: tokenExpiration,
      isEmailVerified: false,
    });

    await user.save();

    // Enviar email de verificación
    await sendVerificationEmail(email, verificationToken);

    res.status(201).json({
      success: true,
      message: "Registro exitoso. Por favor verifica tu correo electrónico.",
      requiresVerification: true,
    });
  } catch (error) {
    console.error("Error en signup:", error);
    res.status(500).json({ message: ERROR_MESSAGES.SERVER_ERROR });
  }
};

exports.googleSignIn = async (req, res) => {
  try {
    const { googleIdToken } = req.body;

    if (!googleIdToken) {
      return res.status(400).json({ message: ERROR_MESSAGES.MISSING_GOOGLE_TOKEN });
    }

    const ticket = await client.verifyIdToken({
      idToken: googleIdToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { email, name } = ticket.getPayload();
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({ email, name });
      await addUserToFidelidappAccount(email, name);
    }

    let account = await Account.findOne({ owner: user._id });
    if (!account) {
      account = await createAccount(user._id, email, name);
      log.logAction(email, "google_signup", "Usuario y cuenta creados via Google");
    }

    const token = generateToken(user);

    res.status(200).json({
      token,
      user: {
        email: user.email,
        name: user.name,
        slug: account?.slug || null,
      },
    });
  } catch (error) {
    console.error("Error en Google signin:", error);
    res.status(500).json({ message: ERROR_MESSAGES.SERVER_ERROR });
  }
};

exports.addUserToFidelidappAccount = async (email, name) => {
  const fappid = process.env.FAPPID;
  if (!fappid) {
    console.error("Fidelidapp account ID not found in environment variables");
    return;
  }

  try {
    // Convert email to lowercase for consistency
    const normalizedEmail = email.toLowerCase();

    // Check if the user already exists as a client
    let client = await Client.findOne({ email: normalizedEmail });

    if (!client) {
      // Create a new client if not found
      client = new Client({
        name: name,
        email: normalizedEmail,
        addedAccounts: [{ accountId: fappid }],
      });

      // Save the new client to the database
      client = await client.save();
      console.log("New Fidelidapp client created:", client);
    } else {
      // Add the Fidelidapp account to the existing client if not already added
      const accountExists = client.addedAccounts.some((account) => account.accountId === fappid);

      if (!accountExists) {
        client.addedAccounts.push({ accountId: fappid });
        client = await client.save();
        console.log("Fidelidapp account added to existing client:", client);
      }
    }

    // Add client to Fidelidapp account's `clients` array
    await Account.findByIdAndUpdate(fappid, {
      $addToSet: {
        clients: { id: client._id, name: client.name, email: client.email },
      },
    });
    //Send register email
    await sendRegisterEmail(client.name, client.email);

    console.log("User successfully added to Fidelidapp:", normalizedEmail);

    log.logAction(normalizedEmail, "user_added", "Usuario agregado a Fidelidapp", "#leads");
  } catch (error) {
    console.error("Error adding user to Fidelidapp account:", error);
    throw error; // Re-throw error for higher-level handling
  }
};

exports.current = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: ERROR_MESSAGES.MISSING_TOKEN });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const account = await Account.findOne({ userEmails: decoded.email }).select("-__v").lean();

    if (!account) {
      return res.status(404).json({ message: ERROR_MESSAGES.ACCOUNT_NOT_FOUND });
    }

    const plan = await Plan.findOne({ planStatus: account.planStatus }).select("-__v").lean();

    if (!account.accountQr) {
      const qrCode = await generateQr();
      await Account.findByIdAndUpdate(account._id, { accountQr: qrCode });
      account.accountQr = qrCode;
    }

    res.status(200).json({
      name: decoded.name,
      accounts: account,
      plan,
    });
  } catch (error) {
    console.error("Error en current:", error);
    res.status(500).json({ message: ERROR_MESSAGES.SERVER_ERROR });
  }
};

exports.logout = (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Sesión cerrada exitosamente" });
};

exports.contact = async (req, res) => {
  try {
    const { name, email, message, phone, organization } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ message: ERROR_MESSAGES.MISSING_FIELDS });
    }

    const details = `
      Nombre: ${name}
      Email: ${email}
      Organización: ${organization || "No especificada"}
      Teléfono: ${phone || "No especificado"}
      Mensaje: ${message}
    `;

    await log.logAction(email, "contact", details, "#leads");
    res.status(201).json({ message: "Mensaje enviado con éxito" });
  } catch (error) {
    console.error("Error en contact:", error);
    res.status(500).json({ message: ERROR_MESSAGES.SERVER_ERROR });
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
      isEmailVerified: false,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "El enlace de verificación es inválido o ha expirado",
      });
    }

    // Actualizar el usuario
    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    // Crear cuenta para el usuario si no tiene una
    const existingAccount = await Account.findOne({ owner: user._id });
    if (!existingAccount) {
      await createAccount(user._id, user.email, user.name);
      log.logAction(user.email, "email_verified", "Email verificado y cuenta creada");
    } else {
      log.logAction(user.email, "email_verified", "Email verificado");
    }

    // Enviar email de bienvenida siempre después de la verificación
    try {
      await sendRegisterEmail(user.name, user.email);
      log.logAction(user.email, "welcome_email_sent", "Email de bienvenida enviado");
    } catch (emailError) {
      console.error("Error al enviar email de bienvenida:", emailError);
      // Registrar el error pero continuar con el flujo
      log.logAction(user.email, "welcome_email_error", "Error al enviar email de bienvenida");
    }

    res.status(200).json({
      success: true,
      message: "Email verificado exitosamente. Ya puedes iniciar sesión.",
      redirectUrl: "/auth/login",
    });
  } catch (error) {
    console.error("Error en verificación de email:", error);
    res.status(500).json({
      success: false,
      message: "Error al verificar el email. Por favor, intenta nuevamente.",
    });
  }
};
