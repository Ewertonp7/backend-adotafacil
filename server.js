require('dotenv').config();
const express = require('express');
const cors = require('cors');
const recuperarSenhaRoutes = require("./src/routes/recuperarSenhaRoutes");
const animaisRoutes = require('./src/routes/animais');

const app = express();

app.use(express.json());
app.use(cors());

app.use("/api/recuperar-senha", recuperarSenhaRoutes);

require('./src/config/db');

const uploadRoutes = require('./src/routes/upload.routes');
const authRoutes = require('./src/routes/authRoutes');
const usuariosRoutes = require('./src/routes/usuarios');

app.use('/api', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);

// Montar as rotas de animais sob o prefixo /api/animais
app.use('/api/animais', animaisRoutes); // CORRIGIDO AQUI


console.log('Rotas de upload foram carregadas!');
console.log('Rotas de usuários carregadas!');

app.get('/', (req, res) => {
    res.send('API funcionando');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});