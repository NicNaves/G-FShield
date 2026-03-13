function log(level, message, extra = {}) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service: "webservice-api",
    message,
    ...extra,
  };

  console.log(JSON.stringify(payload));
}

module.exports = {
  info(message, extra) {
    log("INFO", message, extra);
  },
  warn(message, extra) {
    log("WARN", message, extra);
  },
  error(message, extra) {
    log("ERROR", message, extra);
  },
};
