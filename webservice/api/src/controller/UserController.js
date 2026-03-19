const UserService = require("../services/UserService");
const { clearAuthCookie, setAuthCookie, signAuthToken } = require("../utils/authSession");

class UserController {
  async registrar(req, res) {
    const { name, email, cpf, telefone, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nome, e-mail e senha sao obrigatorios." });
    }

    try {
      const usuarioCriado = await UserService.criarUsuario(
        { name, email, cpf, telefone, password, role },
        req.user || null
      );
      return res.status(201).json(usuarioCriado);
    } catch (error) {
      console.error("Erro ao criar usuario:", error.message);
      return res.status(400).json({ error: error.message || "Erro ao criar usuario." });
    }
  }

  async login(req, res) {
    const { email, password } = req.body;
    const invalidCredentialsMessage = "Credenciais invalidas.";

    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha sao obrigatorios." });
    }

    try {
      const usuario = await UserService.encontrarUsuarioPorEmail(email);
      if (!usuario) {
        return res.status(401).json({ error: invalidCredentialsMessage });
      }

      if (!usuario.active) {
        return res.status(403).json({ error: "Usuario inativo. Procure um administrador." });
      }

      const senhaValida = await UserService.verificarSenha(password, usuario.password);
      if (!senhaValida) {
        return res.status(401).json({ error: invalidCredentialsMessage });
      }

      const { token, expiresInMs } = signAuthToken(usuario);
      setAuthCookie(res, token, expiresInMs);

      return res.status(200).json({
        message: "Login bem-sucedido.",
        token,
        role: usuario.role,
        userId: usuario.id,
        expiresInMs,
      });
    } catch (error) {
      console.error("Erro ao fazer login:", error.message);
      return res.status(400).json({ error: error.message || "Erro ao fazer login." });
    }
  }

  logout(req, res) {
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
