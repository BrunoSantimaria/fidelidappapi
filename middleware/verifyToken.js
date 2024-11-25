const jwt = require("jsonwebtoken");

exports.verifyToken = async (req, res, next) => {
  try {
    // Prioridad 1: Verificar el token en los headers
    let token = req.headers.authorization?.split(" ")[1];

    // Prioridad 2: Verificar en las cookies
    if (!token) {
      token = req.cookies.token;
    }

    // Prioridad 3: Verificar en query params
    if (!token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        res.clearCookie("token");
        return res.status(401).json({ message: "Invalid token" });
      }
      req.name = decoded.name;
      req.email = decoded.email;
      req.userid = decoded.id;
      next();
    });
  } catch (error) {
    console.error("Error en la verificación del token:", error);
    return res.status(401).json({ message: "Token verification failed" });
  }
};
