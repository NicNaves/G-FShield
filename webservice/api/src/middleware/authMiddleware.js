const jwt = require("jsonwebtoken");
const {
  authDisabled,
  allowPublicRegistration,
  authLoginRateWindowMs,
  authLoginRateMaxAttempts,
  authRegisterRateWindowMs,
  authRegisterRateMaxAttempts,
} = require("../config/runtimeConfig");
const userService = require("../services/UserService");
const { extractAuthToken } = require("../utils/authSession");

const rateBuckets = new Map();

function getClientAddress(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean);

  return forwardedFor || req.ip || req.socket?.remoteAddress || "unknown";
}

function cleanupExpiredBuckets(now = Date.now()) {
  for (const [key, bucket] of rateBuckets.entries()) {
    if (!bucket || bucket.expiresAt <= now) {
      rateBuckets.delete(key);
    }
  }
}

function createRateLimitMiddleware({ scope, windowMs, maxAttempts }) {
  return (req, res, next) => {
    const now = Date.now();
    cleanupExpiredBuckets(now);

    const routeScope = `${scope}:${req.method}:${req.path}`;
    const clientKey = `${routeScope}:${getClientAddress(req)}`;
    const currentBucket = rateBuckets.get(clientKey);

    if (!currentBucket || currentBucket.expiresAt <= now) {
      rateBuckets.set(clientKey, {
        count: 1,
        expiresAt: now + windowMs,
      });
      return next();
    }

    if (currentBucket.count >= maxAttempts) {
      const retryAfterSeconds = Math.max(Math.ceil((currentBucket.expiresAt - now) / 1000), 1);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({ error: "Muitas tentativas. Tente novamente em instantes." });
    }

    currentBucket.count += 1;
    rateBuckets.set(clientKey, currentBucket);
    return next();
  };
}

const loginRateLimitMiddleware = createRateLimitMiddleware({
  scope: "auth-login",
  windowMs: authLoginRateWindowMs,
  maxAttempts: authLoginRateMaxAttempts,
});

const registerRateLimitMiddleware = createRateLimitMiddleware({
  scope: "auth-register",
  windowMs: authRegisterRateWindowMs,
  maxAttempts: authRegisterRateMaxAttempts,
});

async function authMiddleware(req, res, next) {
  if (authDisabled) {
    req.user = {
      id: 1,
      role: "ADMIN",
      authDisabled: true,
    };
    return next();
  }

  const token = extractAuthToken(req);
  if (!token) {
    return res.status(401).json({ error: "Acesso negado. Token nao fornecido." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: process.env.JWT_ISSUER || "g-fshield-webservice",
      audience: process.env.JWT_AUDIENCE || "g-fshield-front",
    });
    const user = await userService.getUserById(Number(verified.id));

    if (!user) {
      return res.status(401).json({ error: "Usuario nao encontrado. Faca login novamente." });
    }

    if (user.active === false) {
      return res.status(403).json({ error: "Usuario inativo. Procure um administrador." });
    }

    req.user = {
      ...verified,
      id: user.id,
      role: user.role,
      active: user.active,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Token invalido ou expirado." });
  }
}

function roleMiddleware(role) {
  return (req, res, next) => {
    if (authDisabled) {
      return next();
    }

    if (req.user.role !== role) {
      return res.status(403).json({ error: "Acesso proibido. Permissao insuficiente." });
    }
    return next();
  };
}

function anyRoleMiddleware(roles = []) {
  return (req, res, next) => {
    if (authDisabled) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Acesso proibido. Permissao insuficiente." });
    }

    return next();
  };
}

function registerPolicyMiddleware(req, res, next) {
  if (allowPublicRegistration) {
    return next();
  }

  return authMiddleware(req, res, () => roleMiddleware("ADMIN")(req, res, next));
}

module.exports = {
  authMiddleware,
  roleMiddleware,
  anyRoleMiddleware,
  registerPolicyMiddleware,
  loginRateLimitMiddleware,
  registerRateLimitMiddleware,
};
