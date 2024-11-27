const { Storage } = require("@google-cloud/storage");
const multer = require("multer");
const path = require("path");

// Decode Base64-encoded service account key
const base64Credentials = process.env.GOOGLE_CREDENTIALS_BASE64;

if (!base64Credentials) {
  throw new Error("GOOGLE_CREDENTIALS_BASE64 environment variable is not set");
}

const jsonCredentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
const serviceAccountKey = JSON.parse(jsonCredentials); // Parse JSON string to an object

// Set up Google Cloud Storage with the service account credentials
const storage = new Storage({
  credentials: serviceAccountKey,
});

const bucket = storage.bucket("fapp_promotion_images"); // Name of your GCP bucket

// Configure multer to handle file uploads
const upload = multer({
  storage: multer.memoryStorage(), // Store file in memory temporarily
  limits: { fileSize: 10000000 }, // Limit file size to 10MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb); // Ensure correct file type
  },
}).single("image"); // 'image' is the field name sent from frontend

// Check file type function
function checkFileType(file, cb) {
  const filetypes = /jpeg|jpg|png|gif/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);
  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb("Error: Images Only!");
  }
}

// File upload middleware
exports.fileUpload = async (req, res, next) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }
    console.log(req);
    if (!req.file) {
      return next();
    }

    try {
      const blob = bucket.file(`${Date.now()}-${req.file.originalname}`);
      const blobStream = blob.createWriteStream({
        resumable: false,
        contentType: req.file.mimetype,
      });

      blobStream.on("error", (err) => {
        console.error(err);
        return res.status(500).send({ message: "Failed to upload to GCP" });
      });

      blobStream.on("finish", async () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
        console.log("Image uploaded to GCP: ", publicUrl);
        req.body.imageUrl = publicUrl;
        next();
      });

      blobStream.end(req.file.buffer); // Subir el buffer del archivo
    } catch (error) {
      console.error("Internal server error:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  });
};
