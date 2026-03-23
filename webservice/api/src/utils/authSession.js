const jwt = require("jsonwebtoken");

const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "g-fshield_session";
const AUTH_COOKIE_MAX_AGE_MS = Math.max(Number(process.env.AUTH_COOKIE_MAX_AGE_MS || 24 * 60 * 60 * 1000), 60 * 1000);

function isSecureCookieEnabled() {
  return String(process.env.AUTH_COOKIE_SECURE || process.env.NODE_ENV === "production").toLowerCase() === "true";
}

function assertJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET nao configurado.");
  }
}

function signAuthToken(user = {}) {
  assertJwtSecret();

  const payload = {
    id: Number(user.id),
    role: String(user.role || "VIEWER").toUpperCase(),
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    issuer: process.env.JWT_ISSUER || "g-fshield-webservice",
    audience: process.env.JWT_AUDIENCE || "g-fshield-front",
  });

  return {
    token,
    expiresInMs: AUTH_COOKIE_MAX_AGE_MS,
  };
}

function serializeCookie(name, value, maxAgeMs) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(Math.floor(maxAgeMs / 1000), 0)}`,
  ];

  if (isSecureCookieEnabled()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function setAuthCookie(res, token, maxAgeMs = AUTH_COOKIE_MAX_AGE_MS) {
  res.setHeader("Set-Cookie", serializeCookie(AUTH_COOKIE_NAME, token, maxAgeMs));
}

function clearAuthCookie(res) {
  res.setHeader("Set-Cookie", serializeCookie(AUTH_COOKIE_NAME, "", 0));
}

function parseCookies(cookieHeader = "") {
  return String(cookieHeader || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex <= 0) {
        return cookies;
      }

      const name = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      cookies[name] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function extractAuthToken(req) {
  const authorizationHeader = String(req.headers.authorization || "");
  if (authorizationHeader.toLowerCase().startsWith("bearer ")) {
    return authorizationHeader.slice(7).trim();
  }

  const cookies = parseCookies(req.headers.cookie || "");
  return cookies[AUTH_COOKIE_NAME] || null;
}

module.exports = {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
  clearAuthCookie,
  extractAuthToken,
  parseCookies,
  setAuthCookie,
  signAuthToken,
};
