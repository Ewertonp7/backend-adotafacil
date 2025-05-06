const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadImagem } = require('../controllers/uploadController');

// Configuração do Multer diretamente no routes (alternativa à configuração separada)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5 // Máximo de 5 arquivos
  }
});

// Rota de teste simples
router.get('/teste-upload', (req, res) => {
  res.send('Rota de upload funcionando!');
});

// Rota de upload para múltiplas imagens - CORRIGIDA
router.post('/upload', 
  upload.fields([{ name: 'imagens[]', maxCount: 5 }]), // Formato correto para múltiplos arquivos
  uploadImagem
);

module.exports = router;