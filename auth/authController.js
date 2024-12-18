const User = require("./User.model.js");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const Account = require("../accounts/Account.model.js");
const Plan = require("../plans/Plans.model.js");
const log = require("../logger/logger.js");
const { generateQr, sendQrCode } = require("../utils/generateQrKeys.js");

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
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: ERROR_MESSAGES.INVALID_CREDENTIALS });
    }

    const token = generateToken(user);
    log.logAction(email, "login", "Login exitoso");

    res.status(200).json({ token, user: { email: user.email, name: user.name } });
  } catch (error) {
    console.error("Error en signin:", error);
    res.status(500).json({ message: ERROR_MESSAGES.SERVER_ERROR });
  }
};

exports.signUp = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    console.log("🚀 ~ exports.signUp= ~ name, email, password:", name, email, password);

    if (!name || !email || !password) {
      return res.status(400).json({ message: ERROR_MESSAGES.MISSING_FIELDS });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: ERROR_MESSAGES.EMAIL_EXISTS });
    }

    // Crear nuevo usuario
    const user = new User({ name, email, password });
    await user.save();

    // Verificar si ya existe una cuenta con este email
    const existingAccount = await Account.findOne({ userEmails: email });

    if (!existingAccount) {
      // Si no existe cuenta, crear una nueva
      const account = await createAccount(user._id, email, name);
      log.logAction(email, "signup", "Usuario y cuenta creados");

      return res.status(201).json({
        user: { email: user.email, name: user.name },
        account,
      });
    }

    // Si existe una cuenta, solo agregar el usuario
    log.logAction(email, "signup", "Usuario creado y agregado a cuenta existente");
    return res.status(201).json({
      user: { email: user.email, name: user.name },
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
    }

    const account = await Account.findOne({ userEmails: email });
    if (!account) {
      await createAccount(user._id, email, name);
      log.logAction(email, "google_signup", "Usuario y cuenta creados via Google");
    }

    const token = generateToken(user);
    res.status(200).json({
      token,
      user: { email: user.email, name: user.name },
    });
  } catch (error) {
    console.error("Error en Google signin:", error);
    res.status(500).json({ message: ERROR_MESSAGES.SERVER_ERROR });
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
      await sendQrCode(account);
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
