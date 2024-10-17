const jwt = require("jsonwebtoken");

exports.verifyToken = async (req, res, next) => {
  try {
    const token = req.cookies.authToken; // Assuming token is stored in a cookie
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }
    // Verify token
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        // Token verification failed
        res.clearCookie("token"); // Clear invalid token from cookie
        return res.status(401).json({ message: "Invalid token" });
      } else {
        // Token is valid, extract user ID and proceed
        //console.log("Token Validado",decoded)
        req.name = decoded.name;
        req.email = decoded.email;
        req.userid = decoded.id;
        next();
      }
    });
  } catch (error) {
    return res.status(401).json({ message: "No token provided" });
  }
};
