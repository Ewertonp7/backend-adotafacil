// ARQUIVO: src/routes/usuarios.js (VERSÃO FINAL E COMPLETA)

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { blobServiceClient, containerName } = require('../config/blobStorage');
const db = require('../config/db');

// multer com buffer em memória
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Rota de teste (mantida)
router.get('/teste', (req, res) => {
  res.send('Rota /api/usuarios/teste funcionando!');
});

// Suas funções de validação originais (mantidas)
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

// Sua função de upload para o Azure (mantida)
const uploadParaBlobAzure = async (file) => {
  if (!file || !file.buffer) { // Verificação de buffer adicionada
    throw new Error('Arquivo ou buffer de arquivo não fornecido para upload');
  }
  const blobName = `${Date.now()}-${file.originalname}`;
  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  try {
    await blockBlobClient.uploadData(file.buffer, {
      blobHTTPHeaders: { blobContentType: file.mimetype },
    });
    return blockBlobClient.url;
  } catch (err) {
    console.error('Erro no upload para o Azure Blob:', err.message);
    throw err;
  }
};

// GET - Buscar dados do usuário (ATUALIZADO PARA BUSCAR ENDEREÇO COMPLETO)
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.execute(
      'SELECT id_usuario, nome, email, telefone, imagem_url, endereco, estado, cidade, bairro FROM usuarios WHERE id_usuario = ?',
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ erro: 'Erro ao buscar usuário', detalhes: error.message });
  }
});

// PUT - Atualizar dados do usuário (ROTA UNIFICADA E CORRIGIDA)
router.put('/:id', upload.single('imagem'), async (req, res) => {
  const { id } = req.params;
  const { nome, email, telefone, senha, endereco, estado, cidade, bairro } = req.body;
  
  let imagem_url_final;

  try {
    // Busca a URL da imagem atual para usar como fallback
    const [userRows] = await db.execute('SELECT imagem_url FROM usuarios WHERE id_usuario = ?', [id]);
    if (userRows.length > 0) {
      imagem_url_final = userRows[0].imagem_url;
    }

    // Se uma nova imagem foi enviada na requisição, faz o upload e sobrepõe a URL
    if (req.file) {
      console.log("Nova imagem de perfil recebida, fazendo upload...");
      imagem_url_final = await uploadParaBlobAzure(req.file);
    }

    // Montagem dinâmica da query para atualizar apenas os campos enviados
    let queryParts = [];
    const values = [];

    if (nome) { queryParts.push('nome = ?'); values.push(nome); }
    if (email) { queryParts.push('email = ?'); values.push(email); }
    if (telefone) { queryParts.push('telefone = ?'); values.push(telefone); }
    if (endereco) { queryParts.push('endereco = ?'); values.push(endereco); }
    if (estado) { queryParts.push('estado = ?'); values.push(estado); }
    if (cidade) { queryParts.push('cidade = ?'); values.push(cidade); }
    if (bairro) { queryParts.push('bairro = ?'); values.push(bairro); }
    
    // A URL da imagem é sempre parte da atualização para refletir a nova ou manter a antiga
    queryParts.push('imagem_url = ?');
    values.push(imagem_url_final);

    if (senha) {
      const senhaCriptografada = await bcrypt.hash(senha, 10);
      queryParts.push('senha = ?');
      values.push(senhaCriptografada);
    }

    // Evita fazer um update vazio se apenas a imagem_url for enviada sem alteração
    if (queryParts.length === 1 && !req.file) {
        return res.status(200).json({ mensagem: 'Nenhuma alteração detectada.', usuario: userRows[0] });
    }
    
    const query = `UPDATE usuarios SET ${queryParts.join(', ')} WHERE id_usuario = ?`;
    values.push(id);

    await db.execute(query, values);

    // Busca os dados 100% atualizados para retornar ao front-end
    const [updatedRows] = await db.execute('SELECT id_usuario, nome, email, telefone, imagem_url, endereco, estado, cidade, bairro FROM usuarios WHERE id_usuario = ?', [id]);
    
    res.json({ mensagem: 'Usuário atualizado com sucesso!', usuario: updatedRows[0] });

  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    res.status(500).json({ erro: 'Erro ao atualizar usuário', detalhes: error.message });
  }
});


// A rota POST separada para imagem não é mais necessária, foi unificada com o PUT.
// Você pode apagar a rota router.post('/:id/imagem', ...); do seu arquivo.

module.exports = router;