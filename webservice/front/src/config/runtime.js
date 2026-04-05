const envFlagEnabled = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return String(value).toLowerCase() === "true";
};

export const AUTH_DISABLED = envFlagEnabled(process.env.REACT_APP_AUTH_DISABLED, false);
export const ALLOW_PUBLIC_REGISTRATION = envFlagEnabled(process.env.REACT_APP_ALLOW_PUBLIC_REGISTRATION, false);
export const DEV_TOKEN = process.env.REACT_APP_DEV_TOKEN || "local-dev-token";
export const DEV_ROLE = process.env.REACT_APP_DEV_ROLE || "ADMIN";
export const DEV_USER_ID = process.env.REACT_APP_DEV_USER_ID || "1";
