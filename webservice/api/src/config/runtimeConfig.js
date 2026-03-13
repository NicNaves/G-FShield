function toBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
}

const authDisabled = toBoolean(process.env.AUTH_DISABLED, false);
const mockDataEnabled = toBoolean(process.env.MOCK_DATA_ENABLED, false);

module.exports = {
  authDisabled,
  mockDataEnabled,
};
