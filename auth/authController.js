const User = require("./User.model.js");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const Account = require("../accounts/Account.model.js");
const Plan = require("../plans/Plans.model.js");
const Client = require("../promotions/client.model.js");
const log = require("../logger/logger.js");
const { generateQr, sendQrCode } = require("../utils/generateQrKeys.js");
const {sendRegisterEmail} = require("../utils/emailSender.js");

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
    const account = await Account.findOne({ owner: user._id });

    res.status(200).json({ token, user: { email: user.email, name: user.name, slug: account.slug } });
  } catch (error) {
    console.error("Error en signin:", error);
    res.status(500).json({ message: ERROR_MESSAGES.SERVER_ERROR });
  }
};

exports.signUp = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    //console.log("🚀 ~ exports.signUp= ~ name, email, password:", name, email, password);

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
    await addUserToFidelidappAccount(email, name);

    // Verificar si ya existe una cuenta con este email
    const existingAccount = await Account.findOne({ userEmails: email });

    if (!existingAccount) {
      // Si no existe cuenta, crear una nueva
      const account = await createAccount(user._id, email, name);
      log.logAction(email, "signup", "Usuario y cuenta creados");

      return res.status(201).json({
        user: { email: user.email, name: user.name, slug: account.slug },
        account,
      });
    }

    // Si existe una cuenta, solo agregar el usuario
    log.logAction(email, "signup", "Usuario creado y agregado a cuenta existente");
    const account = await Account.findOne({ userEmails: email });
    return res.status(201).json({
      user: { email: user.email, name: user.name, slug: account.slug },
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

    const account = await Account.findOne({ owner: user._id });
    if (!account) {
      await createAccount(user._id, email, name);
      log.logAction(email, "google_signup", "Usuario y cuenta creados via Google");
    }

    const token = generateToken(user);

    res.status(200).json({
      token,
      user: { email: user.email, name: user.name, slug: account.slug },
    });
  } catch (error) {
    console.error("Error en Google signin:", error);
    res.status(500).json({ message: ERROR_MESSAGES.SERVER_ERROR });
  }
};

const addUserToFidelidappAccount = async (email, name) => {
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
