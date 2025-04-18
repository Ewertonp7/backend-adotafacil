const { BlobServiceClient } = require('@azure/storage-blob');

const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const sas = process.env.AZURE_STORAGE_SAS_TOKEN;
const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

const blobServiceClient = new BlobServiceClient(
  `https://${account}.blob.core.windows.net?${sas}`
);

const containerClient = blobServiceClient.getContainerClient(containerName);

const uploadToAzure = async (file) => {
  const blobName = `${Date.now()}-${file.originalname}`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(file.buffer, {
    blobHTTPHeaders: { blobContentType: file.mimetype },
  });

  return blockBlobClient.url;
};

module.exports = { uploadToAzure };