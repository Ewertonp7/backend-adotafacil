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

// Função para fazer upload
const uploadImagem = async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const blobName = `${Date.now()}-${file.originalname}`;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadData(file.buffer, {
            blobHTTPHeaders: { blobContentType: file.mimetype }
        });

        const imageUrl = blockBlobClient.url;

        return res.status(200).json({ imageUrl });
    } catch (error) {
        console.error('Erro no upload:', error.message);
        return res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
    }
};

module.exports = { uploadImagem };