const multer = require('multer');

// Configuração para armazenar arquivos na memória (para conversão em buffer)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Limite de 5 MB por arquivo
  },
});

module.exports = upload;
