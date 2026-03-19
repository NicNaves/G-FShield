import api from "./client";

const login = async (email, password) => {
  try {    
    const response = await api.post("/login", {
      email: String(email || "").trim().toLowerCase(),
      password,
    });
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error("Server error");
  }
};

const register = async (payload) => {
  try {
    const response = await api.post("/register", payload);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error("Server error");
  }
};

const me = async (options = {}) => {
  try {
    const response = await api.get("/me", options);
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error("Server error");
  }
};

const logout = async () => {
  try {
    const response = await api.post("/logout");
    return response.data;
  } catch (error) {
    throw error.response ? error.response.data : new Error("Server error");
  }
};

export default { login, register, me, logout };
