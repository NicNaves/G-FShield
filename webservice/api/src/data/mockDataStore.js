const users = [
  {
    id: 1,
    name: "Administrador Local",
    email: "admin@local.dev",
    cpf: "12345678901",
    telefone: "559999999999",
    role: "ADMIN",
    active: true,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  },
  {
    id: 2,
    name: "Operador Demo",
    email: "user@local.dev",
    cpf: "98765432100",
    telefone: "559888888888",
    role: "VIEWER",
    active: true,
    createdAt: "2026-03-01T10:00:00.000Z",
    updatedAt: "2026-03-01T10:00:00.000Z",
  },
];

let nextUserId = users.length + 1;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isoNow() {
  return new Date().toISOString();
}

function getDefaultUser() {
  return users[0];
}

function createLoginResponse(email) {
  const matchedUser = users.find((user) => user.email === email) || getDefaultUser();

  return {
    message: "Login desabilitado no modo local.",
    token: "local-dev-token",
    role: matchedUser.role,
    userId: matchedUser.id,
    authDisabled: true,
  };
}

function listUsers() {
  return clone(users);
}

function getUserById(id) {
  const user = users.find((item) => item.id === Number(id));
  return user ? clone(user) : null;
}

function createUser(userData) {
  const now = isoNow();
  const newUser = {
    id: nextUserId++,
    name: userData.name || "Novo usuario",
    email: userData.email || `user${nextUserId}@local.dev`,
    cpf: userData.cpf || "",
    telefone: userData.telefone || "",
    role: userData.role || "VIEWER",
    active: userData.active !== false,
    createdAt: now,
    updatedAt: now,
  };

  users.push(newUser);
  return clone(newUser);
}

function updateUser(id, userData) {
  const index = users.findIndex((item) => item.id === Number(id));
  if (index === -1) {
    return null;
  }

  users[index] = {
    ...users[index],
    ...userData,
    id: users[index].id,
    updatedAt: isoNow(),
  };

  return clone(users[index]);
}

module.exports = {
  createLoginResponse,
  listUsers,
  getUserById,
  createUser,
  updateUser,
};
