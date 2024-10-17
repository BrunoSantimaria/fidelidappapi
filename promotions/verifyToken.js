const jwt = require("jsonwebtoken");

exports.verifyToken = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }
    // Verify token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        res.clearCookie("token");
        return res.status(401).json({ message: "Invalid token" });
      } else {
        console.log(decoded);
        req.name = decoded.name;
        req.email = decoded.email;
        next();
      }
    });
  } catch (error) {
    return res.status(401).json({ message: "No token provided" });
  }
};
