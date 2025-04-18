const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { blobServiceClient, containerName } = require('../config/blobStorage');
const db = require('../config/db');

// multer com buffer em memória
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Rota de teste
router.get('/teste', (req, res) => {
  res.send('🟢 Rota /api/usuarios/teste funcionando!');
});

// Validações
function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function validarCPF(cpf) {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  let soma = 0, resto;
  for (let i = 1; i <= 9; i++) soma += parseInt(cpf[i - 1]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9])) return false;

  soma = 0;
  for (let i = 1; i <= 10; i++) soma += parseInt(cpf[i - 1]) * (12 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  return resto === parseInt(cpf[10]);
}

function validarCNPJ(cnpj) {
  cnpj = cnpj.replace(/[^\d]+/g, '');
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

  let t = cnpj.length - 2, d = cnpj.substring(t), d1 = parseInt(d.charAt(0)), d2 = parseInt(d.charAt(1));
  let calc = x => {
    let n = cnpj.substring(0, x), y = x - 7, s = 0;
    for (let i = x; i >= 1; i--) s += n.charAt(x - i) * y--;
    return ((s % 11) < 2 ? 0 : 11 - (s % 11));
  };
  return calc(t) === d1 && calc(t + 1) === d2;
}

// Função para upload da imagem no Azure
const uploadParaBlobAzure = async (file) => {
  const blobName = `${Date.now()}-${file.originalname}`;
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(file.buffer, {
    blobHTTPHeaders: { blobContentType: file.mimetype },
  });

  return blockBlobClient.url;
};

// GET - Buscar dados do usuário
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.execute(
      'SELECT id_usuario, nome, email, telefone, imagem_url FROM usuarios WHERE id_usuario = ?',
      [id]
    );
    console.log('Resultado da consulta:', rows);
    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar usuário', detalhes: error.message });
  }
});

// PUT - Atualizar dados do usuário
router.put('/:id', upload.single('imagem'), async (req, res) => {
  const { id } = req.params;
  const { nome, email, telefone, senha, cpfOuCnpj } = req.body;
  let imagem_url = null;

  try {
    // Validar email
    if (email && !validarEmail(email)) {
      return res.status(400).json({ erro: 'Email inválido.' });
    }

    // Verificar se o e-mail está em uso por outro usuário
    if (email) {
      const [emailRows] = await db.execute(
        'SELECT id_usuario FROM usuarios WHERE email = ? AND id_usuario != ?',
        [email, id]
      );
      if (emailRows.length > 0) {
        return res.status(409).json({ erro: 'E-mail já está em uso por outro usuário.' });
      }
    }

    // Validação de CPF ou CNPJ
    if (cpfOuCnpj) {
      const num = cpfOuCnpj.replace(/\D/g, '');
      if (num.length === 11 && !validarCPF(num)) {
        return res.status(400).json({ erro: 'CPF inválido.' });
      }
      if (num.length === 14 && !validarCNPJ(num)) {
        return res.status(400).json({ erro: 'CNPJ inválido.' });
      }
    }

    // Upload da imagem se enviada
    if (req.file) {
      imagem_url = await uploadParaBlobAzure(req.file);
    }

    // Montar a query dinamicamente
    let query = 'UPDATE usuarios SET nome = ?, email = ?, telefone = ?';
    const values = [nome, email, telefone];

    if (senha) {
      if (senha.length < 6) {
        return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
      }
      const senhaCriptografada = await bcrypt.hash(senha, 10);
      query += ', senha = ?';
      values.push(senhaCriptografada);
    }

    if (imagem_url) {
      query += ', imagem_url = ?';
      values.push(imagem_url);
    }

    if (cpfOuCnpj) {
      const numero = cpfOuCnpj.replace(/\D/g, '');
      if (numero.length === 11) {
        query += ', cpf = ?';
      } else if (numero.length === 14) {
        query += ', cnpj = ?';
      }
      values.push(numero);
    }

    query += ' WHERE id_usuario = ?';
    values.push(id);

    await db.execute(query, values);
    res.json({ mensagem: 'Usuário atualizado com sucesso!' });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao atualizar usuário', detalhes: error.message });
  }
});

// POST - Upload de imagem separado
router.post('/:id/imagem', upload.single('imagem'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Imagem não enviada' });

    const url = await uploadParaBlobAzure(req.file);
    res.json({ imagem_url: url });
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao fazer upload da imagem', detalhes: error.message });
  }
});

module.exports = router;