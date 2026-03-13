const jwt = require("jsonwebtoken");
const { authDisabled } = require("../config/runtimeConfig");

function authMiddleware(req, res, next) {
  if (authDisabled) {
    req.user = {
      id: 1,
      role: "ADMIN",
      authDisabled: true,
    };
    return next();
  }

  const token = req.headers.authorization?.split(" ")[1] || req.query?.token;
  if (!token) {
    return res
      .status(401)
      .json({ error: "Acesso negado. Token não fornecido." });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
}

function roleMiddleware(role) {
  return (req, res, next) => {
    if (authDisabled) {
      return next();
    }

    if (req.user.role !== role) {
      return res
        .status(403)
        .json({ error: "Acesso proibido. Permissão insuficiente." });
    }
    next();
  };
}

function anyRoleMiddleware(roles = []) {
  return (req, res, next) => {
    if (authDisabled) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "Acesso proibido. Permissao insuficiente." });
    }

    next();
  };
}

module.exports = { authMiddleware, roleMiddleware, anyRoleMiddleware };
