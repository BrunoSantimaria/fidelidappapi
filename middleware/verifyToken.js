const jwt = require("jsonwebtoken");

exports.verifyToken = async (req, res, next) => {
  console.log("Token recibido:", req.cookies.token); // Verifica que el token se está recibiendo correctamente

  try {
    const token = req.cookies.token; // Asegúrate de que el nombre de la cookie sea correcto
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    // Verificar token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        // Error al verificar el token
        res.clearCookie("authToken"); // Borra la cookie si el token es inválido
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
    console.error("Error en la verificación del token:", error); // Log para depurar el error
    return res.status(401).json({ message: "No token provided" });
  }
};
