import axios from "axios";
import { toast } from "react-toastify";

const resolveApiUrl = () => {
  const configuredUrl = String(process.env.REACT_APP_API_URL || "").trim();

  if (configuredUrl) {
    return configuredUrl;
  }

  return "/api";
};

export const API_URL = resolveApiUrl();

const AUTH_REDIRECT_FLAG = "gfshield-auth-redirecting";

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

const clearStoredAuth = () => {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("role");
  sessionStorage.removeItem("userId");
};

const shouldRedirectToLogin = (error) => {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.error || error?.message || "").toLowerCase();

  return (
    status === 401
    || message.includes("token")
    || message.includes("usuario nao encontrado")
    || message.includes("faca login novamente")
    || message.includes("sessao")
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
    if (error?.config?.skipAuthRedirect) {
      return Promise.reject(error);
    }

    if (shouldRedirectToLogin(error)) {
      redirectToLogin(
        error?.response?.data?.error || "Sua sessao expirou. Faca login novamente."
      );
    }

    return Promise.reject(error);
  }
);

export { clearStoredAuth };
export default api;
