const User = require("./User.model.js");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const Account = require("../accounts/Account.model.js");
const Plan = require("../plans/Plans.model.js");
const Agenda = require("../agenda/agenda.model.js");
const log = require("../logger/logger.js");

// Controlador para iniciar sesión
exports.signIn = async (req, res) => {
  try {
    // Obtener datos del cuerpo de la solicitud
    const { email, password } = req.body;

    // Verificar si el usuario existe
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    // Generar token de autenticación
    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET);

    log.logAction(email, "login", "Login Successful");

    // Send response with the token
    res.status(200).json({ token });
  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    res.status(500).json({ message: "Error del servidor" });
  }
};

// Controlador para registrar un nuevo usuario
exports.signUp = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    //Validar que vengan los campos
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Faltan campos obligatorios" });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "El email ya esta asociado a una cuenta" });
    }

    // Verificar si el email ya está asociado a una cuenta
    const existingAccount = await Account.findOne({ emails: email });

    if (existingAccount) {
      // Si el email ya está asociado a una cuenta, solo crear el usuario
      const user = new User({ name, email, password });
      await user.save();

      log.logAction(email, "signup", "Usuario Creado y Agregado a Cuenta Existente");
      return res.status(201).json(user);
    } else {
      // Si no hay cuenta asociada, crear una nueva cuenta y el usuario
      const user = await new User({ name, email, password });
      await user.save();

      const account = await new Account({ owner: user._id, userEmails: [email] });
      await account.save();

      log.logAction(email, "signup", "Usuario y Cuentas Creados");
      return res.status(201).json({ user, account });
    }
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Controlador para autenticarse con Google
exports.googleSignIn = async (req, res) => {
  try {
    const { googleIdToken } = req.body;

    if (!googleIdToken) {
      return res.status(400).json({ message: "Missing Google ID token" });
    }

    // Verify Google ID token
    const ticket = await client.verifyIdToken({
      idToken: googleIdToken,
      audience: process.env.GOOGLE_CLIENT_ID, // Your Google OAuth2 client ID
    });
    const payload = ticket.getPayload();

    // Extract user data
    const { email, name } = payload;
    // Check if user exists in the database (pseudo code)
    let user = await User.findOne({ email });

    // If user doesn't exist, create a new user
    if (!user) {
      user = new User({ email, name });
      await user.save();
      console.log("User created:", user);
    }

    // Check if account exists for the user
    const account = await Account.findOne({ userEmails: email });

    if (!account) {
      // If account doesn't exist, create a new account
      const newAccount = await new Account({ owner: user._id, userEmails: [email] });
      await newAccount.save();
    }

    const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, process.env.JWT_SECRET);

    res.status(200).json({ token });
  } catch (error) {
    console.error("Error signing in with Google:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Route to handle /auth/current endpoint
exports.current = async (req, res) => {
  try {
    let token = req.headers.authorization?.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    const account = await Account.findOne({ userEmails: email });

    const plan = await Plan.findOne({ planStatus: account.planStatus });

    res.status(200).json({ name: req.name, accounts: account, plan: plan });
  } catch (error) {
    console.error("Error fetching current user:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

//Lougout endpoint
exports.logout = async (req, res) => {
  console.log("Deslogeando usuario", req.headers.authorization?.split(" ")[1]);
  try {
    res.clearCookie("token");
    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    console.error("Error logging out:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.contact = async (req, res) => {
  try {
    const { name, email, message } = req.body;
    const details = name + ": " + message;
    const contact = await log.logAction(email, "contact", details);
    res.status(201).json({ message: "Message sent successfully" });
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
