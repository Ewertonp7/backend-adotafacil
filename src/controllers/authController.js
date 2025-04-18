const bcrypt = require('bcryptjs');
const db = require('../config/db');

const cadastrarUsuario = async (req, res) => {
    const {
        nome,
        email,
        senha,
        telefone,
        cpf,
        cnpj,
        endereco,
        imagem_url
    } = req.body;

    try {
        const [rows] = await db.execute('SELECT * FROM usuarios WHERE email = ?', [email]);
        if (rows.length > 0) {
            return res.status(400).json({ error: 'Email já cadastrado.' });
        }

        if (!nome || !email || !senha || !telefone) {
            return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
        }

        if (senha.length < 6) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
        }

        if (cnpj) {
            if (!/^\d{14}$/.test(cnpj)) {
                return res.status(400).json({ error: 'CNPJ deve conter exatamente 14 dígitos.' });
            }
        } else if (cpf) {
            if (!/^\d{11}$/.test(cpf)) {
                return res.status(400).json({ error: 'CPF deve conter exatamente 11 dígitos.' });
            }
        } else {
            return res.status(400).json({ error: 'CPF ou CNPJ deve ser fornecido.' });
        }

        const senhaCriptografada = await bcrypt.hash(senha, 10);
        const dataCadastro = new Date();

        await db.execute(`
            INSERT INTO usuarios (
                nome, email, senha, telefone, cpf, cnpj, endereco,
                imagem_url, data_cadastro, id_situacao, status_adoção
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            nome,
            email,
            senhaCriptografada,
            telefone,
            cpf || null,
            cnpj || null,
            endereco || null,
            imagem_url || null,
            dataCadastro,
            1,
            1
        ]);

        return res.status(201).json({ message: 'Usuário criado com sucesso.' });

    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        return res.status(500).json({ error: 'Erro interno no servidor.' });
    }
};

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

        res.status(200).json({
            message: 'Login realizado com sucesso!',
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