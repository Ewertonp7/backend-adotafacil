const express = require('express');
const router = express.Router();
const recuperarSenhaController = require('../controllers/recuperarSenhaController');

router.post('/enviar-codigo', recuperarSenhaController.enviarCodigo);
router.post('/confirmarCodigo', recuperarSenhaController.confirmarCodigo);
router.post('/alterar-senha', recuperarSenhaController.alterarSenha);

module.exports = router;