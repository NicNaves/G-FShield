const jwt = require("jsonwebtoken");
const { authDisabled } = require("../config/runtimeConfig");
const userService = require("../services/UserService");
const { extractAuthToken } = require("../utils/authSession");

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

module.exports = { authMiddleware, roleMiddleware, anyRoleMiddleware };
