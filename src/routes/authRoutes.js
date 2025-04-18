const express = require('express');
const router = express.Router();
const { cadastrarUsuario } = require('../controllers/authController');
const authController = require('../controllers/authController');

// Rota de cadastro
router.post('/cadastrar', authController.cadastrarUsuario);

// Rota de login
router.post('/login', authController.loginUsuario);

module.exports = router;