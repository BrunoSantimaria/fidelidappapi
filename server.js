const app = require("./app");
const mongoose = require("mongoose");
const chalk = require("chalk");

const PORT = process.env.PORT || 8080;
const DB_URI = process.env.DB_URI;
const isTestDB = DB_URI.includes("test");

mongoose
  .connect(DB_URI)
  .then(() => {
    console.log(chalk.yellow("Connected to MongoDB"));
    if (!isTestDB) console.log(chalk.red("RUNNING ON PRODUCTION!!!! ... BE CAREFUL"));
    else console.log(chalk.yellow("RUNNING ON TEST"));
    // Start server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => console.error("Error connecting to MongoDB:", err));
