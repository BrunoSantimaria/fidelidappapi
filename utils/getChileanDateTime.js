const moment = require("moment-timezone");
const getChileanDateTime = () => {
  return moment().tz("America/Santiago").format("YYYY-MM-DDTHH:mm:ss.SSSZ");
};

module.exports = { getChileanDateTime };
