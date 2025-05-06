const multer = require('multer');

const storage = multer.memoryStorage();

// Configuração do Multer para aceitar múltiplos arquivos no campo 'imagens[]'
const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Verifica se é uma imagem
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens são permitidas!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // Limite de 5MB por arquivo
    files: 5 // Máximo de 5 arquivos
  }
});

// Exporta o middleware configurado para múltiplos arquivos no campo 'imagens[]'
module.exports = upload.array('imagens[]', 5);