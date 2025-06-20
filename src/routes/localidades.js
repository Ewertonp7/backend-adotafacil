const express = require('express');
const router = express.Router();
const localidadesController = require('../controllers/localidadesController');

// Define a rota GET que recebe a UF (ex: SP, MG, RJ) como parâmetro na URL
router.get('/cidades/:uf', localidadesController.getCidadesPorEstado);

module.exports = router;