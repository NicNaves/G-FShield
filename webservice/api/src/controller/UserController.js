const UserService = require("../services/UserService");
const jwt = require("jsonwebtoken");

class UserController {
  /**
   * Registra um novo usuário no sistema.
   */
  async registrar(req, res) {
    const { name, email, cpf, telefone, password, role } = req.body;

    // Validações básicas no controller
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Nome, e-mail e senha são obrigatórios." });
    }

    try {
      const usuarioCriado = await UserService.criarUsuario(
        { name, email, cpf, telefone, password, role },
        req.user || null
      );
      return res.status(201).json(usuarioCriado);
    } catch (error) {
      console.error("Erro ao criar usuário:", error.message);
      return res.status(400).json({ error: error.message || "Erro ao criar usuário." });
    }
  }

  /**
   * Realiza login de um usuário.
   */
  async login(req, res) {
    const { email, password } = req.body;

    // Validações básicas no controller
    if (!email || !password) {
      return res.status(400).json({ error: "E-mail e senha são obrigatórios." });
    }

    try {
      const usuario = await UserService.encontrarUsuarioPorEmail(email);
      if (!usuario) {
        return res.status(401).json({ error: "Usuário não encontrado." });
      }

      if (!usuario.active) {
        return res.status(403).json({ error: "Usuario inativo. Procure um administrador." });
      }

      const senhaValida = await UserService.verificarSenha(password, usuario.password);
      if (!senhaValida) {
        return res.status(401).json({ error: "Senha incorreta." });
      }

      // Gerar token JWT
      const token = jwt.sign(
        { id: usuario.id, role: usuario.role },
        process.env.JWT_SECRET,
        { expiresIn: "1d" }
      );

      return res.status(200).json({
        message: "Login bem-sucedido",
        token,
        role: usuario.role,
        userId: usuario.id,
      });
    } catch (error) {
      console.error("Erro ao fazer login:", error.message);
      return res.status(400).json({ error: error.message || "Erro ao fazer login." });
    }
  }

  /**
   * Busca todos os usuários.
   */
  async buscarTodosUsuarios(req, res) {
    try {
      const usuarios = await UserService.getAllUsers();
      return res.status(200).json(usuarios);
    } catch (error) {
      console.error("Erro ao buscar usuários:", error.message);
      return res.status(500).json({ error: "Erro ao buscar usuários." });
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

  /**
   * Busca um usuário pelo ID.
   */
  async buscarUsuarioPorId(req, res) {
    const { id } = req.params;

    // Validações básicas no controller
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: "ID inválido." });
    }

    try {
      const usuario = await UserService.getUserById(Number(id));
      if (!usuario) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }
      return res.status(200).json(usuario);
    } catch (error) {
      console.error("Erro ao buscar usuário por ID:", error.message);
      return res.status(500).json({ error: "Erro ao buscar usuário." });
    }
  }

  /**
   * Atualiza um usuário pelo ID.
   */
  async atualizarUsuario(req, res) {
    const { id } = req.params;
    const userData = req.body;
  
    if (!id || isNaN(Number(id))) {
      return res.status(400).json({ error: "ID inválido." });
    }
  
    try {
      const updatedUser = await UserService.updateUser(parseInt(id, 10), userData);
      if (!updatedUser) {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }
      return res.status(200).json(updatedUser);
    } catch (error) {
      console.error("Erro ao atualizar usuário:", error.message);
      if (error.message === "Usuário não encontrado.") {
        return res.status(404).json({ error: "Usuário não encontrado." });
      }
      return res.status(400).json({ error: error.message || "Erro ao atualizar usuário." });
    }
  }
  
  
}

module.exports = new UserController();
