import axios from "axios";
import { toast } from "react-toastify";

export const API_URL = process.env.REACT_APP_API_URL || "http://localhost:4000/api";

const AUTH_REDIRECT_FLAG = "gfshield-auth-redirecting";

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

const clearStoredAuth = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("userId");
};

const shouldRedirectToLogin = (error) => {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.error || error?.message || "").toLowerCase();

  return (
    status === 401
    || message.includes("token")
    || message.includes("usuario nao encontrado")
    || message.includes("usuário não encontrado")
    || message.includes("faca login novamente")
    || message.includes("faça login novamente")
  );
};

const redirectToLogin = (message) => {
  if (window.location.pathname === "/authentication/sign-in" || sessionStorage.getItem(AUTH_REDIRECT_FLAG) === "1") {
    return;
  }

  sessionStorage.setItem(AUTH_REDIRECT_FLAG, "1");
  clearStoredAuth();
  toast.error(message);
  window.setTimeout(() => {
    window.location.assign("/authentication/sign-in");
  }, 300);
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (shouldRedirectToLogin(error)) {
      redirectToLogin(
        error?.response?.data?.error || "Sua sessao expirou. Faca login novamente."
      );
    }

    return Promise.reject(error);
  }
);

export default api;
