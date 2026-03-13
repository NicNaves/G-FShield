const digitsOnly = (value = "") => String(value || "").replace(/\D/g, "");

const normalizeEmail = (value = "") => String(value || "").trim().toLowerCase().replace(/\s+/g, "");

const formatCpf = (value = "") => {
  const digits = digitsOnly(value).slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  }

  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

const formatPhone = (value = "") => {
  const digits = digitsOnly(value).slice(0, 11);

  if (digits.length === 0) {
    return "";
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  const areaCode = digits.slice(0, 2);
  const localNumber = digits.slice(2);
  const prefixLength = digits.length > 10 ? 5 : 4;

  if (localNumber.length <= prefixLength) {
    return `(${areaCode}) ${localNumber}`;
  }

  return `(${areaCode}) ${localNumber.slice(0, prefixLength)}-${localNumber.slice(prefixLength)}`;
};

const isValidEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));

const isValidCpf = (value = "") => digitsOnly(value).length === 11;

const isValidPhone = (value = "") => {
  const digits = digitsOnly(value);
  return digits.length === 10 || digits.length === 11;
};

const formatUserFormValues = (userData = {}) => ({
  ...userData,
  name: String(userData.name || "").trim(),
  email: normalizeEmail(userData.email || ""),
  cpf: formatCpf(userData.cpf || ""),
  telefone: formatPhone(userData.telefone || ""),
});

const buildUserPayload = (userData = {}) => {
  const payload = {
    ...userData,
    name: typeof userData.name === "string" ? userData.name.trim() : userData.name,
    email: normalizeEmail(userData.email || ""),
    cpf: digitsOnly(userData.cpf || ""),
    telefone: digitsOnly(userData.telefone || ""),
  };

  if (!payload.cpf) {
    delete payload.cpf;
  }

  if (!payload.telefone) {
    delete payload.telefone;
  }

  return payload;
};

export {
  buildUserPayload,
  digitsOnly,
  formatCpf,
  formatPhone,
  formatUserFormValues,
  isValidCpf,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
};
