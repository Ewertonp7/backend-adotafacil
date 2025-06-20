const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken'); // <-- MUDANÇA: Importa a biblioteca de token
const db = require('../config/db');
require('dotenv').config(); // Garante que as variáveis do .env, como JWT_SECRET, sejam lidas

// --- FUNÇÃO DE CADASTRO ATUALIZADA ---
const cadastrarUsuario = async (req, res) => {
    // Pega os campos antigos e os novos de endereço
    const {
        nome, email, senha, telefone, cpf, cnpj,
        endereco, estado, cidade, bairro // <-- MUDANÇA: novos campos
    } = req.body;

    try {
        const [rows] = await db.execute('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (rows.length > 0) {
            return res.status(409).json({ error: 'Email já cadastrado.' }); // 409 Conflict é mais apropriado
        }

        // Validações básicas
        if (!nome || !email || !senha || !telefone || !estado || !cidade || !bairro || !endereco) {
            return res.status(400).json({ error: 'Todos os campos, incluindo endereço completo, são obrigatórios.' });
        }
        if (senha.length < 6) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
        }
        // ... outras validações que você já tem ...

        const senhaCriptografada = await bcrypt.hash(senha, 10);
        const dataCadastro = new Date();

        // <-- MUDANÇA: Atualiza o comando SQL para incluir os novos campos
        const sql = `
            INSERT INTO usuarios (
                nome, email, senha, telefone, cpf, cnpj, endereco, estado, cidade, bairro,
                data_cadastro, id_situacao, status_adoção
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const values = [
            nome, email, senhaCriptografada, telefone, cpf || null, cnpj || null,
            endereco, estado, cidade, bairro, // <-- MUDANÇA: novos valores
            dataCadastro, 1, 1
        ];

        const [result] = await db.execute(sql, values);
        const novoUsuarioId = result.insertId;

        // --- MUDANÇA: LÓGICA DE AUTO-LOGIN ---
        // 1. Gera o token para o novo usuário
        const token = jwt.sign(
            { id: novoUsuarioId, email: email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' } // Token expira em 24 horas
        );

        // 2. Cria o objeto do usuário para retornar ao app
        const usuarioParaRetorno = {
            id_usuario: novoUsuarioId,
            nome: nome,
            email: email,
            telefone: telefone
        };

        // 3. Retorna o token e os dados do usuário
        return res.status(201).json({
            message: 'Usuário criado com sucesso!',
            token: token,
            usuario: usuarioParaRetorno
        });

    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};


// --- FUNÇÃO DE LOGIN ATUALIZADA ---
const loginUsuario = async (req, res) => {
    const { email, senha } = req.body;

    try {
        const [rows] = await db.execute('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado.' });
        }

        const usuario = rows[0];

        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
        if (!senhaCorreta) {
            return res.status(401).json({ error: 'Senha incorreta.' });
        }

        // --- MUDANÇA: GERA E RETORNA O TOKEN ---
        const token = jwt.sign(
            { id: usuario.id_usuario, email: usuario.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            message: 'Login realizado com sucesso!',
            token: token, // <-- MUDANÇA: token adicionado à resposta
            usuario: {
                id_usuario: usuario.id_usuario,
                nome: usuario.nome,
                email: usuario.email,
                telefone: usuario.telefone,
                imagem_url: usuario.imagem_url,
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

module.exports = {
    cadastrarUsuario,
    loginUsuario
};