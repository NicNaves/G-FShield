const bcrypt = require("bcryptjs");

const hash = (value, rounds) => bcrypt.hash(value, rounds);

const compare = (value, hashedValue) => bcrypt.compare(value, hashedValue);

module.exports = {
  hash,
  compare,
};
