const crypto = require("crypto");
const UserService = require("../services/UserService");
const { clearAuthCookie, setAuthCookie, signAuthToken } = require("../utils/authSession");

class UserController {
  constructor() {
    this.registrar = this.registrar.bind(this);
    this.login = this.login.bind(this);
    this.logout = this.logout.bind(this);
    this.buscarTodosUsuarios = this.buscarTodosUsuarios.bind(this);
    this.me = this.me.bind(this);
    this.buscarUsuarioPorId = this.buscarUsuarioPorId.bind(this);
    this.atualizarUsuario = this.atualizarUsuario.bind(this);
  }

  obfuscateEmail(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail.includes("@")) {
      return "unknown";
    }

    const [localPart, domain] = normalizedEmail.split("@");
    const localPrefix = localPart.length <= 2 ? "**" : `${localPart.slice(0, 2)}***`;
    return `${localPrefix}@${domain}`;
  }

  getRequestFingerprint(req) {
    const origin = String(req.headers.origin || "").trim().toLowerCase();
    const userAgent = String(req.headers["user-agent"] || "").trim();
    const ipCandidate = String(req.headers["x-forwarded-for"] || req.ip || req.socket?.remoteAddress || "")
      .split(",")
      .map((entry) => entry.trim())
      .find(Boolean) || "unknown";

    const raw = `${ipCandidate}|${origin}|${userAgent}`;
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  }

  getAuditContext(req) {
    return {
      requestFingerprint: this.getRequestFingerprint(req),
      path: req.originalUrl || req.url || "unknown",
      method: req.method || "UNKNOWN",
      authDisabled: Boolean(req.user?.authDisabled),
      actorId: req.user?.id || null,
      actorRole: req.user?.role || null,
    };
  }

  logAuthEvent(level, message, context = {}) {
    const payload = {
      timestamp: new Date().toISOString(),
      level,
      service: "webservice-api",
      area: "auth",
      message,
      ...context,
    };

    console.log(JSON.stringify(payload));
  }

  logAuthFailure(message, req, context = {}) {
    this.logAuthEvent("WARN", message, {
      ...this.getAuditContext(req),
      ...context,
    });
  }

  logAuthSuccess(message, req, context = {}) {
    this.logAuthEvent("INFO", message, {
      ...this.getAuditContext(req),
      ...context,
    });
  }

  async registrar(req, res) {
    const { name, email, cpf, telefone, password, role } = req.body;

    if (!name || !email || !password) {
      this.logAuthFailure("User registration rejected due to missing required fields.", req, {
        emailHint: this.obfuscateEmail(email),
      });
      return res.status(400).json({ error: "Nome, e-mail e senha sao obrigatorios." });
    }

    try {
      const usuarioCriado = await UserService.criarUsuario(
        { name, email, cpf, telefone, password, role },
        req.user || null
      );
      this.logAuthSuccess("User registration completed.", req, {
        emailHint: this.obfuscateEmail(email),
        createdUserId: usuarioCriado?.id || null,
        createdRole: usuarioCriado?.role || "VIEWER",
      });
      return res.status(201).json(usuarioCriado);
    } catch (error) {
      this.logAuthFailure("User registration failed.", req, {
        emailHint: this.obfuscateEmail(email),
        reason: error.message || "unknown",
      });
      return res.status(400).json({ error: error.message || "Erro ao criar usuario." });
    }
  }

  async login(req, res) {
    const { email, password } = req.body;
    const invalidCredentialsMessage = "Credenciais invalidas.";
    const emailHint = this.obfuscateEmail(email);

    if (!email || !password) {
      this.logAuthFailure("Login rejected due to missing credentials.", req, { emailHint });
      return res.status(400).json({ error: "E-mail e senha sao obrigatorios." });
    }

    try {
      const usuario = await UserService.encontrarUsuarioPorEmail(email);
      if (!usuario) {
        this.logAuthFailure("Login failed: user not found.", req, { emailHint });
        return res.status(401).json({ error: invalidCredentialsMessage });
      }

      if (!usuario.active) {
        this.logAuthFailure("Login failed: inactive user.", req, {
          emailHint,
          attemptedUserId: usuario.id,
        });
        return res.status(403).json({ error: "Usuario inativo. Procure um administrador." });
      }

      const senhaValida = await UserService.verificarSenha(password, usuario.password);
      if (!senhaValida) {
        this.logAuthFailure("Login failed: invalid password.", req, {
          emailHint,
          attemptedUserId: usuario.id,
        });
        return res.status(401).json({ error: invalidCredentialsMessage });
      }

      const { token, expiresInMs } = signAuthToken(usuario);
      setAuthCookie(res, token, expiresInMs);

      this.logAuthSuccess("Login completed.", req, {
        emailHint,
        userId: usuario.id,
        role: usuario.role,
      });

      return res.status(200).json({
        message: "Login bem-sucedido.",
        token,
        role: usuario.role,
        userId: usuario.id,
        expiresInMs,
      });
    } catch (error) {
      this.logAuthFailure("Login request failed unexpectedly.", req, {
        emailHint,
        reason: error.message || "unknown",
      });
      return res.status(400).json({ error: error.message || "Erro ao fazer login." });
    }
  }

  logout(req, res) {
    this.logAuthSuccess("Logout completed.", req);
    clearAuthCookie(res);
    return res.status(200).json({ message: "Sessao encerrada com sucesso." });
  }

  async buscarTodosUsuarios(req, res) {
    try {
      const usuarios = await UserService.getAllUsers();
      return res.status(200).json(usuarios);
    } catch (error) {
      console.error("Erro ao buscar usuarios:", error.message);
      return res.status(500).json({ error: "Erro ao buscar usuarios." });
    }
  }

  async me(req, res) {
    try {
      const usuario = await UserService.getUserSummaryById(Number(req.user.id));
      if (!usuario) {
        return res.status(404).json({ error: "Usuario nao encontrado." });
      }

      return res.status(200).json(usuario);
    } catch (error) {
      console.error("Erro ao buscar usuario autenticado:", error.message);
      return res.status(500).json({ error: "Erro ao buscar usuario autenticado." });
    }
  }

  async buscarUsuarioPorId(req, res) {
    const { id } = req.params;

    if (!id || Number.isNaN(Number(id))) {
      return res.status(400).json({ error: "ID invalido." });
    }

    try {
      const usuario = await UserService.getUserById(Number(id));
      if (!usuario) {
        return res.status(404).json({ error: "Usuario nao encontrado." });
      }
      return res.status(200).json(usuario);
    } catch (error) {
      console.error("Erro ao buscar usuario por ID:", error.message);
      return res.status(500).json({ error: "Erro ao buscar usuario." });
    }
  }

  async atualizarUsuario(req, res) {
    const { id } = req.params;
    const userData = req.body;

    if (!id || Number.isNaN(Number(id))) {
      return res.status(400).json({ error: "ID invalido." });
    }

    try {
      const updatedUser = await UserService.updateUser(parseInt(id, 10), userData);
      if (!updatedUser) {
        return res.status(404).json({ error: "Usuario nao encontrado." });
      }
      return res.status(200).json(updatedUser);
    } catch (error) {
      console.error("Erro ao atualizar usuario:", error.message);
      if (error.message === "Usuario nao encontrado.") {
        return res.status(404).json({ error: "Usuario nao encontrado." });
      }
      return res.status(400).json({ error: error.message || "Erro ao atualizar usuario." });
    }
  }
}

module.exports = new UserController();
