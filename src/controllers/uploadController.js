const { BlobServiceClient } = require('@azure/storage-blob');
const dotenv = require('dotenv');

dotenv.config();

// Dados do .env
const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const sasToken = process.env.AZURE_STORAGE_SAS_TOKEN;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

// Montar a URL do serviço com SAS
const blobServiceClient = new BlobServiceClient(
    `https://${account}.blob.core.windows.net?${sasToken}`
);
const containerClient = blobServiceClient.getContainerClient(containerName);

// Função para fazer upload e atualizar o banco
const uploadImagem = async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        // Gera um nome único para o arquivo
        const blobName = `${Date.now()}-${file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        // Faz o upload para o Azure
        await blockBlobClient.uploadData(file.buffer, {
            blobHTTPHeaders: { blobContentType: file.mimetype }
        });

        // URL da imagem no Azure
        const imageUrl = blockBlobClient.url;

        // Atualizando a URL da imagem no banco de dados
        const { id_usuario } = req.body; // Certifique-se de que o ID do usuário vem no corpo da requisição

        if (!id_usuario) {
            return res.status(400).json({ error: 'ID de usuário não fornecido' });
        }

        // Atualiza o usuário no banco de dados com a URL da imagem
        const resultado = await db.query('UPDATE usuarios SET imagem_url = ? WHERE id_usuario = ?', [imageUrl, id_usuario]);

        if (resultado.affectedRows === 0) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }

        // Responde com sucesso
        return res.status(200).json({ imageUrl });

    } catch (error) {
        console.error('Erro no upload:', error.message);
        return res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
    }
};

module.exports = { uploadImagem };