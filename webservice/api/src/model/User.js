class User {
  
  #id;
  #name;
  #email;
  #cpf;
  #telefone;
  #password;
  #role;
  #createdAt;
  #updatedAt;
  #active;

  constructor({ id, name, email, cpf, telefone, password, role, active = true, createdAt, updatedAt }) {
    this.#id = id;
    this.#name = name;
    this.#email = email;
    this.#cpf = cpf;
    this.#telefone = telefone;
    this.#password = password;
    this.#role = role;
    this.#active = active;
    this.#createdAt = createdAt || new Date();
    this.#updatedAt = updatedAt || new Date();
  }

  
  get id() {
    return this.#id;
  }

  get name() {
    return this.#name;
  }

  set name(value) {
    this.#name = value;
  }

  get email() {
    return this.#email;
  }

  set email(value) {
    this.#email = value;
  }

  get cpf() {
    return this.#cpf;
  }

  set cpf(value) {
    this.#cpf = value;
  }

  get telefone() {
    return this.#telefone;
  }

  set telefone(value) {
    this.#telefone = value;
  }

  get password() {
    return this.#password;
  }

  set password(value) {
    this.#password = value;
  }

  get role() {
    return this.#role;
  }

  set role(value) {
    this.#role = value;
  }

  get active() {
    return this.#active;
  }

  set active(value) {
    this.#active = value;
  }

  get createdAt() {
    return this.#createdAt;
  }

  get updatedAt() {
    return this.#updatedAt;
  }

  
  atualizarDataModificacao() {
    this.#updatedAt = new Date();
  }

  
  static fromPrisma(prismaUser) {
    return new User({
      id: prismaUser.id,
      name: prismaUser.name,
      email: prismaUser.email,
      cpf: prismaUser.cpf,
      telefone: prismaUser.telefone,
      password: prismaUser.password,
      role: prismaUser.role,
      active: prismaUser.active,
      createdAt: prismaUser.createdAt,
      updatedAt: prismaUser.updatedAt,
    });
  }

  
  toJSON() {
    return {
      id: this.#id,
      name: this.#name,
      email: this.#email,
      cpf: this.#cpf,
      telefone: this.#telefone,
      role: this.#role,
      active: this.#active,
      createdAt: this.#createdAt,
      updatedAt: this.#updatedAt,
    };
  }
}

module.exports = User;
