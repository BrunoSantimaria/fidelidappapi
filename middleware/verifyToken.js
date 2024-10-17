const jwt = require("jsonwebtoken");

exports.verifyToken = async (req, res, next) => {
  try {
    // Prioridad 1: Verificar el token en las cookies
    let token = req.cookies.token;
    console.log("Token en cookies:", token, "Token en headers:", req.headers.authorization);

    // Prioridad 2: Si no hay token en las cookies, buscarlo en los headers (para dispositivos móviles)
    if (!token && req.headers.authorization) {
      // El token se espera en formato: "Bearer <token>"
      const bearerToken = req.headers.authorization.split(" ");
      if (bearerToken.length === 2 && bearerToken[0] === "Bearer") {
        token = bearerToken[1];
      }
    }

    // Si no hay token en ninguno de los dos lugares, devolver un error
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Verificar el token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        res.clearCookie("token"); // Borra la cookie si el token es inválido
        return res.status(401).json({ message: "Invalid token" });
      } else {
        // Token válido
        req.name = decoded.name;
        req.email = decoded.email;
        req.userid = decoded.id;
        next();
      }
    });
  } catch (error) {
    console.error("Error en la verificación del token:", error);
    return res.status(401).json({ message: "Token verification failed" });
  }
};
