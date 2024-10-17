const app = require('./app');
const mongoose = require('mongoose');

// Load environment variables
const PORT = process.env.PORT || 8080;
const DB_URI = process.env.DB_URI;

// Connect to MongoDB
mongoose.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
    // Start server
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch(err => console.error('Error connecting to MongoDB:', err));
