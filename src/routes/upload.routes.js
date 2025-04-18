const express = require('express');
const router = express.Router();
const upload = require('../middlewares/uploadMiddleware');
const { uploadImagem } = require('../controllers/uploadController');

// ✅ Rota de teste simples
router.get('/teste-upload', (req, res) => {
  res.send('Rota de upload funcionando!');
});

// Rota de upload
router.post('/upload', upload.single('imagem'), uploadImagem);

module.exports = router;