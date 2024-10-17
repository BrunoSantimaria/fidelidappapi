const { ObjectId } = require("mongodb");
const StrToObjectId = (id) => {
  try {
    return new ObjectId(id);
  } catch (error) {
    console.error("Invalid ID format:", error);
    return null;
  }
};

module.exports = { StrToObjectId };
