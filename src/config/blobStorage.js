const { BlobServiceClient } = require('@azure/storage-blob');

const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;
const sasToken = process.env.AZURE_STORAGE_SAS_TOKEN;

if (!accountName || !sasToken || !containerName) {
    throw new Error("Configurações do Azure Blob Storage ausentes no .env");
}

const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net/?${sasToken}`
);


module.exports = { blobServiceClient, containerName };