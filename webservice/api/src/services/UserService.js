const User = require("../model/User");
const prisma = require("../lib/prisma");
const bcrypt = require("bcrypt");

class UserService {
  sanitizeRole(requestedRole, currentUser) {
    if (currentUser?.role === "ADMIN" && ["ADMIN", "VIEWER"].includes(requestedRole)) {
      return requestedRole;
    }

    return "VIEWER";
  }

  #normalizeEmail(email) {
    return typeof email === "string" ? email.trim().toLowerCase() : email;
  }

  #digitsOnly(value) {
    return typeof value === "string" ? value.replace(/\D/g, "") : value;
  }

  #normalizeUserData(userData = {}) {
    return {
      ...userData,
      name: typeof userData.name === "string" ? userData.name.trim() : userData.name,
      email: this.#normalizeEmail(userData.email),
      cpf: this.#digitsOnly(userData.cpf),
      telefone: this.#digitsOnly(userData.telefone),
    };
  }

  /**
   * Cria um novo usuário no banco de dados com validações e senha criptografada.
   * @param {Object} userData - Dados do usuário.
   * @returns {Promise<User>} - Usuário criado.
   */
  async criarUsuario(userData, currentUser = null) {
    const normalizedUserData = this.#normalizeUserData({
      ...userData,
      role: this.sanitizeRole(userData.role, currentUser),
    });

    this.#validarDadosUsuario(normalizedUserData); 

    
    const usuarioExistente = await prisma.user.findUnique({ where: { email: normalizedUserData.email } });
    if (usuarioExistente) {
      throw new Error("O e-mail já está em uso.");
    }

    
    const hashedPassword = await bcrypt.hash(normalizedUserData.password, 10);

    
    const prismaUser = await prisma.user.create({
      data: {
        ...normalizedUserData,
        password: hashedPassword,
      },
    });

    return User.fromPrisma(prismaUser);
  }

  /**
   * Encontra um usuário pelo e-mail.
   * @param {string} email - E-mail do usuário.
   * @returns {Promise<User|null>} - Usuário encontrado ou null.
   */
  async encontrarUsuarioPorEmail(email) {
    const normalizedEmail = this.#normalizeEmail(email);

    if (!normalizedEmail || typeof normalizedEmail !== "string") {
      throw new Error("E-mail inválido.");
    }

    const prismaUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (prismaUser) {
      return User.fromPrisma(prismaUser);
    }
    return null;
  }

  /**
   * Verifica se a senha fornecida corresponde à senha armazenada.
   * @param {string} password - Senha fornecida.
   * @param {string} hashedPassword - Senha criptografada armazenada.
   * @returns {Promise<boolean>} - True se a senha for válida.
   */
  async verificarSenha(password, hashedPassword) {
    if (!password || typeof password !== "string") {
      throw new Error("Senha inválida.");
    }
    return bcrypt.compare(password, hashedPassword);
  }

  /**
   * Retorna todos os usuários do banco de dados.
   * @returns {Promise<User[]>} - Lista de usuários.
   */
  async getAllUsers() {
    const prismaUsers = await prisma.user.findMany();
    return prismaUsers.map(User.fromPrisma);
  }

  /**
   * Retorna um usuário pelo ID.
   * @param {number} id - ID do usuário.
   * @returns {Promise<User|null>} - Usuário encontrado ou null.
   */
  async getUserById(id) {
    if (!id || typeof id !== "number") {
      throw new Error("ID inválido.");
    }

    const prismaUser = await prisma.user.findUnique({ where: { id } });
    if (prismaUser) {
      return User.fromPrisma(prismaUser);
    }
    return null;
  }

  /**
   * Atualiza os dados de um usuário pelo ID.
   * @param {number} id - ID do usuário.
   * @param {Object} userData - Dados para atualizar.
   * @returns {Promise<User>} - Usuário atualizado.
   */
  async updateUser(id, userData) {
    if (!id || typeof id !== "number") {
      throw new Error("ID inválido.");
    }

    const normalizedUserData = this.#normalizeUserData(userData);

    this.#validarDadosUsuario(normalizedUserData, true); 

    try {
      
      const { id: _, createdAt, updatedAt, ...dataToUpdate } = normalizedUserData;

      
      if (dataToUpdate.password) {
        dataToUpdate.password = await bcrypt.hash(dataToUpdate.password, 10);
      }

      const updatedUser = await prisma.user.update({
        where: { id },
        data: dataToUpdate,
      });

      return User.fromPrisma(updatedUser);
    } catch (error) {
      console.error(`Erro ao atualizar o usuário com ID ${id}:`, error);
      throw new Error("Erro ao atualizar o usuário.");
    }
  }

  async getUserSummaryById(id) {
    const user = await this.getUserById(id);
    return user ? user.toJSON() : null;
  }

  /**
   * Método privado para validar os dados do usuário.
   * @param {Object} userData - Dados do usuário.
   * @param {boolean} [parcial=false] - Se true, valida apenas os campos fornecidos.
   */
  #validarDadosUsuario(userData, parcial = false) {
    const { name, email, cpf, telefone, password, role } = userData;

    if (!parcial) {
      if (!name || typeof name !== "string") {
        throw new Error("Nome é obrigatório e deve ser uma string.");
      }
      if (!email || typeof email !== "string" || !email.includes("@")) {
        throw new Error("E-mail é obrigatório e deve ser válido.");
      }
      if (!password || typeof password !== "string" || password.length < 6) {
        throw new Error("Senha é obrigatória e deve ter pelo menos 6 caracteres.");
      }
    }

    if (parcial && Object.prototype.hasOwnProperty.call(userData, "name")) {
      if (!name || typeof name !== "string") {
        throw new Error("Nome deve ser uma string válida.");
      }
    }

    if (parcial && Object.prototype.hasOwnProperty.call(userData, "email")) {
      if (!email || typeof email !== "string" || !email.includes("@")) {
        throw new Error("E-mail deve ser válido.");
      }
    }

    if (parcial && Object.prototype.hasOwnProperty.call(userData, "password") && password) {
      if (typeof password !== "string" || password.length < 6) {
        throw new Error("Senha deve ter pelo menos 6 caracteres.");
      }
    }

    if (cpf && (!/^\d{11}$/.test(cpf))) {
      throw new Error("CPF deve conter exatamente 11 dígitos.");
    }

    if (telefone && (!/^\d{10,11}$/.test(telefone))) {
      throw new Error("Telefone deve conter 10 ou 11 dígitos.");
    }

    if (role && !["ADMIN", "VIEWER"].includes(role)) {
      throw new Error("O cargo deve ser 'ADMIN' ou 'VIEWER'.");
    }
  }
}

module.exports = new UserService();
