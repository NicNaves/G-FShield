import api from "./client";

const getUsers = async () => {
  try {
    const response = await api.get("/users");
    return response.data; // Retorna os usuários
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    throw error; // Lança o erro para ser tratado onde o método for chamado
  }
};

const createUser = async (userData) => {
  try {
    const response = await api.post("/register", userData);
    return response.data;
  } catch (error) {
    console.error("Erro ao criar usuário:", error);
    throw error;
  }
};

const getUserById = async (id) => {
    try {
      const response = await api.get(`/users/${id}`); // Adiciona o ID na URL
      return response.data; // Retorna os dados do usuário
    } catch (error) {
      console.error(`Erro ao buscar usuário com ID ${id}:`, error);
      throw error; // Lança o erro para ser tratado onde o método for chamado
    }
  };
  

  const updateUser = async (id, userData) => {
    try {
      const response = await api.put(`/users/${id}`, userData); // Envia os dados atualizados
      return response.data; // Retorna o usuário atualizado
    } catch (error) {
      console.error(`Erro ao atualizar usuário com ID ${id}:`, error);
      throw error; // Lança o erro para ser tratado onde o método for chamado
    }
  };

export default { getUsers, getUserById, updateUser, createUser };
