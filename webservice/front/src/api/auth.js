import api from "./client";

const login = async (email, password) => {
  try {    
    const response = await api.post("/login", {
      email,
      password,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error("Erro no servidor");
  }
};

const register = async (payload) => {
  try {
    const response = await api.post("/register", payload);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error("Erro no servidor");
  }
};

const me = async () => {
  try {
    const response = await api.get("/me");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error("Erro no servidor");
  }
};

export default { login, register, me };
