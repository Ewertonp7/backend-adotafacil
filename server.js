require('dotenv').config();
const express = require('express');
const cors = require('cors');
const recuperarSenhaRoutes = require("./src/routes/recuperarSenhaRoutes");

const app = express();



// Middlewares
app.use(express.json());
app.use(cors());

// rec senha
app.use("/api/recuperar-senha", recuperarSenhaRoutes);

// Conexão com o banco de dados
require('./src/config/db');

// Importar rotas
const uploadRoutes = require('./src/routes/upload.routes');
const authRoutes = require('./src/routes/authRoutes');
const usuariosRoutes = require('./src/routes/usuarios');

// Usar rotas
app.use('/api', uploadRoutes);       // Rota para upload: /api/upload
app.use('/api/auth', authRoutes);    // Rotas de autenticação: /api/auth/login, etc.
app.use('/api/usuarios', usuariosRoutes); // /api/usuarios/:id

console.log('Rotas de upload foram carregadas!');
console.log('Rotas de usuários carregadas!');

// Rota de teste
app.get('/', (req, res) => {
    res.send('API funcionando');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});

