const express = require('express');
const router = express.Router();
const animaisController = require('../controllers/animaisController');
const upload = require('../config/multerConfig');

router.post('/cadastrar', upload.array('imagens[]', 5), animaisController.cadastrarAnimal);
router.get('/usuario/:idUsuario', animaisController.getAnimaisByUser);
router.get('/:idAnimal', animaisController.getAnimalById);
router.get('/', animaisController.listAndFilterAnimais);
router.post('/:idAnimal/favoritar', animaisController.toggleFavoriteStatus);
router.post('/atualizar/:idAnimal', upload.array('novas_imagens[]', 5), animaisController.atualizarAnimal);
router.delete('/:idAnimal', animaisController.excluirAnimal);


// Rota para buscar animais favoritos de um usuário específico
// O caminho foi alterado para se encaixar melhor sob um prefixo como /api/animais
router.get('/favoritos/usuario/:idUsuario', animaisController.getFavoritedAnimalsByUser);


module.exports = router;