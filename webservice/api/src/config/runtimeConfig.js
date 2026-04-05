function toBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
}

function toPositiveInteger(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

const authDisabled = toBoolean(process.env.AUTH_DISABLED, false);
const mockDataEnabled = toBoolean(process.env.MOCK_DATA_ENABLED, false);
const allowPublicRegistration = toBoolean(process.env.ALLOW_PUBLIC_REGISTRATION, false);

const authLoginRateWindowMs = toPositiveInteger(process.env.AUTH_LOGIN_RATE_WINDOW_MS, 60_000, 5_000);
const authLoginRateMaxAttempts = toPositiveInteger(process.env.AUTH_LOGIN_RATE_MAX_ATTEMPTS, 20, 1, 500);

const authRegisterRateWindowMs = toPositiveInteger(process.env.AUTH_REGISTER_RATE_WINDOW_MS, 10 * 60_000, 10_000);
const authRegisterRateMaxAttempts = toPositiveInteger(process.env.AUTH_REGISTER_RATE_MAX_ATTEMPTS, 10, 1, 200);

module.exports = {
  authDisabled,
  mockDataEnabled,
  allowPublicRegistration,
  authLoginRateWindowMs,
  authLoginRateMaxAttempts,
  authRegisterRateWindowMs,
  authRegisterRateMaxAttempts,
};
