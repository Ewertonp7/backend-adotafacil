const multer = require('multer');

const storage = multer.memoryStorage(); // salva o arquivo na memória para enviar pro blob
const upload = multer({ storage: storage });

module.exports = upload;