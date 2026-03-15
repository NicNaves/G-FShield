const jwt = require("jsonwebtoken");
const { authDisabled } = require("../config/runtimeConfig");
const userService = require("../services/UserService");

async function authMiddleware(req, res, next) {
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
