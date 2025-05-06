const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const path = require('path');


const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME;
const AZURE_STORAGE_SAS_TOKEN = process.env.AZURE_STORAGE_SAS_TOKEN;


// Validação das credenciais do Azure 
if (!AZURE_STORAGE_ACCOUNT_NAME || !AZURE_STORAGE_CONTAINER_NAME) {
    console.error("ERRO CRÍTICO: Variáveis de ambiente do Azure Storage (ACCOUNT_NAME, CONTAINER_NAME) não definidas!");
    // Em um app real, talvez impedir o início do servidor ou usar um modo degradado.
}
if (!AZURE_STORAGE_SAS_TOKEN /*&& !AZURE_ACCESS_KEY*/) { // Verifica se pelo menos um método de auth está definido
    console.error("ERRO CRÍTICO: Nenhuma credencial do Azure Storage (SAS_TOKEN ou ACCESS_KEY) definida!");
}

// Cria o cliente do Blob Service (pode ser otimizado para não criar a cada requisição)
const getBlobServiceClient = () => {
    const blobServiceUrl = `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`;
    if (AZURE_STORAGE_SAS_TOKEN) {
        // Usa SAS Token se disponível
        return new BlobServiceClient(`${blobServiceUrl}?${AZURE_STORAGE_SAS_TOKEN}`);
    }

    else {
        throw new Error("Nenhuma credencial válida do Azure configurada para criar BlobServiceClient.");
    }
};

// --- Função auxiliar para fazer upload de um buffer para o Azure ---
const uploadImageToAzure = async (fileBuffer, originalName) => {
    if (!fileBuffer || !originalName) {
        throw new Error("Buffer ou nome original do arquivo inválido para upload.");
    }

    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);

    // Gera um nome de blob único para evitar colisões
    const fileExtension = path.extname(originalName) || '.jpg'; // Pega extensão original ou assume .jpg
    const blobName = `animais/${uuidv4()}${fileExtension}`; // Salva na pasta 'animais/'
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    console.log(`Fazendo upload para Azure Blob: ${blobName}`);
    try {
        // Faz upload do buffer. Ajuste o tipo de conteúdo se necessário.
        await blockBlobClient.uploadData(fileBuffer, {
            blobHTTPHeaders: { blobContentType: 'image/jpeg' } // Ajuste se tiver outros tipos (png, etc.)
        });
        console.log(`Upload bem-sucedido: ${blockBlobClient.url}`);
        return blockBlobClient.url; // Retorna a URL pública do blob
    } catch (uploadError) {
        console.error(`Erro ao fazer upload do blob ${blobName}:`, uploadError);
        throw new Error(`Falha no upload da imagem para o Azure: ${uploadError.message}`); // Relança o erro
    }
};


// --- Função auxiliar para parsear imagem_url ---
const parseImagemUrl = (imagemUrlData, animalId) => {
    // (Implementação mantida da resposta anterior)
    let imagensUrls = [];
    if (!imagemUrlData) return imagensUrls;
    try {
        let parsedImages;
        if (typeof imagemUrlData === 'string') {
            try { parsedImages = JSON.parse(imagemUrlData); }
            catch (jsonError) {
                if (imagemUrlData.startsWith('http')) { parsedImages = [{ url: imagemUrlData }]; }
                else { console.warn('imagem_url string não é JSON nem URL válida para ID', animalId, imagemUrlData); return imagensUrls; }
            }
        } else if (Array.isArray(imagemUrlData)) { parsedImages = imagemUrlData; }
        else { console.warn('imagem_url tipo inválido para ID', animalId, typeof imagemUrlData); return imagensUrls; }

        if (Array.isArray(parsedImages)) {
            imagensUrls = parsedImages
                .map(item => item && typeof item === 'object' && typeof item.url === 'string' ? item.url : null)
                .filter(url => url != null && url !== '');
        } else { console.warn('imagem_url parseado não é array para ID', animalId); }
    } catch (e) { console.error('Erro crítico ao parsear imagem_url para ID', animalId, e); imagensUrls = []; }
    return imagensUrls;
};

// --- Função para CADASTRAR um novo animal (IMPLEMENTADA AGORA) ---
const cadastrarAnimal = async (req, res) => {
    console.log("Iniciando cadastro de animal...");
    // Extrai dados do corpo e validação básica
    const { id_usuario, nome, idade, cor, sexo, porte, descricao, especie, raca, id_situacao } = req.body;
    if (!id_usuario || !nome || !idade || !sexo || !porte || !especie || !raca || !id_situacao) {
        return res.status(400).json({ message: "Dados incompletos para cadastrar o animal." });
    }
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "Nenhuma imagem enviada para o cadastro." });
    }
    console.log(`Recebido cadastro para usuário ${id_usuario}, nome ${nome}. Imagens: ${req.files.length}`);

    const uploadedImageUrls = [];
    try {
        // 1. Faz upload das imagens para o Azure Sequencialmente (pode otimizar para paralelo)
        console.log("Iniciando upload de imagens para o Azure...");
        for (const file of req.files) {
            if (!file.buffer) {
                console.warn("Arquivo sem buffer encontrado, pulando:", file.originalname);
                continue; // Pula arquivos sem buffer (pode indicar erro no multer)
            }
            const imageUrl = await uploadImageToAzure(file.buffer, file.originalname);
            uploadedImageUrls.push({ url: imageUrl }); // Salva como objeto {url: ...} para consistência
        }
        console.log("Upload de imagens concluído. URLs:", uploadedImageUrls);

        // Verifica se alguma imagem foi realmente carregada
        if (uploadedImageUrls.length === 0 && req.files.length > 0) {
            throw new Error("Falha no upload de todas as imagens enviadas.");
        }

        // 2. Converte array de URLs para string JSON para salvar no BD
        const imagemUrlJsonString = JSON.stringify(uploadedImageUrls);

        // 3. Insere dados no banco de dados
        const sql = `
            INSERT INTO animais
            (id_usuario, nome, idade, cor, sexo, porte, descricao, especie, raca, id_situacao, imagem_url, data_cadastro)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`; // NOW() para data_cadastro
        const values = [
            id_usuario, nome, idade, cor, sexo, porte, descricao, especie, raca, id_situacao, imagemUrlJsonString
        ];

        console.log("Inserindo animal no banco de dados...");
        const [result] = await db.query(sql, values);
        console.log("Resultado da inserção:", result);

        // Verifica se a inserção foi bem-sucedida
        if (result.affectedRows > 0) {
            console.log(`Animal cadastrado com sucesso. ID: ${result.insertId}`);
            // Retorna sucesso e o ID do novo animal
            return res.status(201).json({
                message: "Animal cadastrado com sucesso!",
                id_animal: result.insertId // Flutter precisa disso para navegar
            });
        } else {
            throw new Error("Nenhuma linha afetada ao inserir no banco de dados.");
        }

    } catch (error) {
        console.error("Erro durante o cadastro do animal:", error);
        // Tentar excluir imagens já carregadas em caso de erro posterior? (complexo)
        res.status(500).json({
            error: 'Erro no servidor ao cadastrar o animal.',
            details: error.message // Envia detalhes do erro para depuração
        });
    }
};

// --- Função para buscar animais por ID de usuário ---
const getAnimaisByUser = async (req, res) => {
    console.log(`Iniciando busca de animais para usuário ID: ${req.params.idUsuario}`);
    const idUsuario = parseInt(req.params.idUsuario);
    if (isNaN(idUsuario)) { return res.status(400).json({ message: 'ID do usuário inválido.' }); }
    try {
        const sql = `
            SELECT a.id_animal, a.nome, a.especie, a.raca, a.idade, a.cor, a.porte, a.sexo,
                   a.descricao, a.imagem_url, a.id_situacao, a.data_cadastro, a.id_usuario,
                   CASE WHEN uf.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_favorited
            FROM animais a LEFT JOIN favoritos uf ON a.id_animal = uf.animal_id AND uf.user_id = ?
            WHERE a.id_usuario = ? ORDER BY a.data_cadastro DESC`;
        const values = [idUsuario, idUsuario];
        const [rows] = await db.query(sql, values);
        if (rows.length === 0) { console.log(`Nenhum animal encontrado para o usuário ID ${idUsuario}`); return res.status(200).json([]); }
        console.log(`Encontrados ${rows.length} animais para o usuário ID ${idUsuario}`);
        const animaisDoUsuario = rows.map(row => {
            const imagensUrls = parseImagemUrl(row.imagem_url, row.id_animal);
            return {
                id: row.id_animal, nome: row.nome, especie: row.especie, raca: row.raca, idade: row.idade,
                cor: row.cor, porte: row.porte, sexo: row.sexo, descricao: row.descricao, imagens: imagensUrls,
                id_situacao: row.id_situacao, data_cadastro: row.data_cadastro, id_usuario: row.id_usuario,
                is_favorited: row.is_favorited === 1
            };
        });
        return res.status(200).json(animaisDoUsuario);
    } catch (error) {
        console.error(`Erro ao buscar animais para usuário ID ${idUsuario}:`, error);
        res.status(500).json({ error: 'Erro no servidor ao buscar seus animais.' });
    }
};

// --- Função para buscar um único animal por ID ---
const getAnimalById = async (req, res) => {
    console.log(`Iniciando busca de animal por ID: ${req.params.idAnimal}`);
    const idAnimal = parseInt(req.params.idAnimal);
    if (isNaN(idAnimal)) { return res.status(400).json({ message: 'ID do animal inválido.' }); }
    try {
        const sql = `
            SELECT a.id_animal, a.nome, a.especie, a.raca, a.idade, a.cor, a.porte, a.sexo,
                   a.descricao, a.imagem_url, a.id_situacao, a.data_cadastro, a.id_usuario,
                   u.nome AS nome_usuario, u.telefone AS telefone_usuario
            FROM animais a LEFT JOIN usuarios u ON a.id_usuario = u.id_usuario
            WHERE a.id_animal = ?`;
        const [rows] = await db.query(sql, [idAnimal]);
        if (rows.length === 0) { console.log(`Animal com ID ${idAnimal} não encontrado.`); return res.status(404).json({ message: 'Animal não encontrado.' }); }
        const animalData = rows[0];
        console.log(`Animal com ID ${idAnimal} encontrado.`);
        const imagensUrls = parseImagemUrl(animalData.imagem_url, animalData.id_animal);
        const responseData = {
            id: animalData.id_animal, nome: animalData.nome, especie: animalData.especie, raca: animalData.raca,
            idade: animalData.idade, cor: animalData.cor, porte: animalData.porte, sexo: animalData.sexo,
            descricao: animalData.descricao, imagens: imagensUrls, id_situacao: animalData.id_situacao,
            data_cadastro: animalData.data_cadastro, id_usuario: animalData.id_usuario,
            usuario: { nome: animalData.nome_usuario, telefone: animalData.telefone_usuario }
        };
        return res.status(200).json({ animal: responseData });
    } catch (error) {
        console.error(`Erro ao buscar animal com ID ${idAnimal}:`, error);
        res.status(500).json({ error: 'Erro no servidor ao buscar detalhes do animal.' });
    }
};

// --- Função para listar E filtrar animais ---
const listAndFilterAnimais = async (req, res) => {
    // (Implementação mantida da resposta anterior)
    console.log('Iniciando busca e filtro de animais COM status de favorito...');
    const { nome, raca, min_idade, max_idade, sexo, porte, busca, id_situacao, id_usuario } = req.query;
    let sql = ` SELECT a.id_animal, a.nome, a.especie, a.raca, a.idade, a.cor, a.porte, a.sexo, a.descricao, a.imagem_url, a.id_situacao, a.data_cadastro, a.id_usuario, CASE WHEN uf.user_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_favorited FROM animais a LEFT JOIN favoritos uf ON a.id_animal = uf.animal_id AND uf.user_id = ? WHERE 1=1`;
    const values = [id_usuario ? parseInt(id_usuario) : null];
    const situacaoFiltro = id_situacao ? parseInt(id_situacao) : 1;
    sql += ` AND a.id_situacao = ?`; values.push(situacaoFiltro);
    if (nome) { sql += ` AND a.nome LIKE ?`; values.push(`%${nome}%`); }
    if (raca) { sql += ` AND a.raca LIKE ?`; values.push(`%${raca}%`); }
    if (min_idade && !isNaN(parseInt(min_idade))) { sql += ` AND a.idade >= ?`; values.push(parseInt(min_idade)); }
    if (max_idade && !isNaN(parseInt(max_idade))) { sql += ` AND a.idade <= ?`; values.push(parseInt(max_idade)); }
    if (sexo) { sql += ` AND a.sexo = ?`; values.push(sexo); }
    if (porte) { sql += ` AND a.porte = ?`; values.push(porte); }
    if (busca) { sql += ` AND (a.nome LIKE ? OR a.raca LIKE ? OR a.descricao LIKE ? OR a.especie LIKE ?)`; values.push(`%${busca}%`, `%${busca}%`, `%${busca}%`, `%${busca}%`); }
    sql += ` ORDER BY a.data_cadastro DESC`;
    try {
        const [rows] = await db.query(sql, values);
        const animaisEncontrados = rows.map(row => {
            const imagensUrls = parseImagemUrl(row.imagem_url, row.id_animal);
            return { id: row.id_animal, nome: row.nome, especie: row.especie, raca: row.raca, idade: row.idade, cor: row.cor, porte: row.porte, sexo: row.sexo, descricao: row.descricao, imagens: imagensUrls, id_situacao: row.id_situacao, data_cadastro: row.data_cadastro, id_usuario: row.id_usuario, is_favorited: row.is_favorited === 1 };
        });
        return res.status(200).json(animaisEncontrados);
    } catch (error) { console.error('Erro ao buscar/filtrar animais com status de favorito:', error); res.status(500).json({ error: 'Erro no servidor ao buscar animais.' }); }
};

// --- Função para favoritar/desfavoritar um animal ---
const toggleFavoriteStatus = async (req, res) => {
    // (Implementação mantida da resposta anterior)
    console.log('Iniciando toggle de favorito...');
    const idAnimal = parseInt(req.params.idAnimal); const { idUsuario } = req.body;
    if (isNaN(idAnimal) || idUsuario === undefined || idUsuario === null) { return res.status(400).json({ message: 'IDs do animal e usuário são obrigatórios e válidos.' }); }
    try {
        const [animalExists] = await db.query('SELECT 1 FROM animais WHERE id_animal = ?', [idAnimal]);
        if (animalExists.length === 0) { return res.status(404).json({ message: 'Animal não encontrado.' }); }
        const checkSql = `SELECT COUNT(*) as count FROM favoritos WHERE user_id = ? AND animal_id = ?`; const [checkRows] = await db.query(checkSql, [idUsuario, idAnimal]);
        const isCurrentlyFavorite = checkRows[0].count > 0;
        if (isCurrentlyFavorite) {
            const deleteSql = `DELETE FROM favoritos WHERE user_id = ? AND animal_id = ?`; await db.query(deleteSql, [idUsuario, idAnimal]); console.log(`Usuário ${idUsuario} desfavoritou animal ${idAnimal}`); return res.status(200).json({ message: 'Animal removido dos favoritos.', isFavorited: false });
        } else { const insertSql = `INSERT INTO favoritos (user_id, animal_id) VALUES (?, ?)`; await db.query(insertSql, [idUsuario, idAnimal]); console.log(`Usuário ${idUsuario} favoritou animal ${idAnimal}`); return res.status(201).json({ message: 'Animal adicionado aos favoritos.', isFavorited: true }); }
    } catch (error) { if (error.code === 'ER_DUP_ENTRY') { console.warn(`Tentativa de favoritar animal ${idAnimal} pelo usuário ${idUsuario} que já era favorito.`); return res.status(200).json({ message: 'Animal já estava nos favoritos.', isFavorited: true }); } console.error(`Erro ao favoritar/desfavoritar animal ${idAnimal} para usuário ${idUsuario}:`, error); res.status(500).json({ error: 'Erro no servidor ao favoritar/desfavoritar.' }); }
};

// --- Função para ATUALIZAR um animal

const atualizarAnimal = async (req, res) => {
    const idAnimal = parseInt(req.params.idAnimal);
    console.log(`Iniciando atualização do animal ID: ${idAnimal}`);

    if (isNaN(idAnimal)) {
        return res.status(400).json({ message: "ID do animal inválido." });
    }

    // Extrai dados do corpo
    const { id_usuario, nome, idade, cor, sexo, porte, descricao, especie, raca, id_situacao } = req.body;
    // Pega APENAS as novas imagens do req.files
    const novasImagens = req.files || [];

    // Validação básica dos dados obrigatórios
    if (!id_usuario || !nome || !idade || !sexo || !porte || !especie || !raca || !id_situacao) {
        return res.status(400).json({ message: "Dados incompletos para atualizar o animal." });
    }
    const requestingUserId = parseInt(id_usuario);
    if (isNaN(requestingUserId)) {
        return res.status(400).json({ message: "ID do usuário inválido na requisição." });
    }

    console.log(`Atualizando animal ${idAnimal} por usuário ${requestingUserId}. Novas imagens: ${novasImagens.length}`);

    let finalImageUrlsAsObjects = []; // Array para guardar as URLs finais como objetos {url: ...}
    try {
        // 1. Autorização E busca de dados atuais (incluindo imagem_url)
        const [animalAtualRows] = await db.query('SELECT id_usuario, imagem_url FROM animais WHERE id_animal = ?', [idAnimal]);
        if (animalAtualRows.length === 0) {
            return res.status(404).json({ message: "Animal a ser atualizado não encontrado." });
        }
        const animalAtual = animalAtualRows[0];

        if (animalAtual.id_usuario !== requestingUserId) {
            console.warn(`Tentativa de atualização não autorizada: Usuário ${requestingUserId} tentando atualizar animal ${idAnimal} do usuário ${animalAtual.id_usuario}`);
            return res.status(403).json({ message: "Você não tem permissão para editar este animal." });
        }

        // Pega as URLs atuais do banco e já formata como objeto
        const urlsAtuaisObjetos = parseImagemUrl(animalAtual.imagem_url, idAnimal).map(url => ({ url: url }));
        finalImageUrlsAsObjects = [...urlsAtuaisObjetos]; // Começa com as imagens atuais do BD

        // 2. Faz upload das NOVAS imagens para o Azure (se houver)
        if (novasImagens.length > 0) {
            console.log("Iniciando upload de novas imagens para o Azure...");
            const newlyUploadedUrls = [];
            for (const file of novasImagens) {
                if (!file.buffer) { console.warn("Arquivo novo sem buffer encontrado, pulando:", file.originalname); continue; }
                const imageUrl = await uploadImageToAzure(file.buffer, file.originalname);
                newlyUploadedUrls.push({ url: imageUrl }); // Adiciona como objeto
            }
            // Adiciona as novas imagens às existentes que vieram do banco
            finalImageUrlsAsObjects.push(...newlyUploadedUrls);
            console.log("Upload de novas imagens concluído.");
            // [Opcional] Implementar exclusão de blobs antigos se necessário
        }

        // 3. Validação da lista final (importante após modificações)
        if (finalImageUrlsAsObjects.length === 0) {
            console.error(`Erro: A lista final de imagens para o animal ${idAnimal} está vazia após a atualização.`);
            // Se chegou aqui, significa que o animal não tinha imagens antes E nenhuma nova foi enviada com sucesso.
            // Pode ser um erro ou uma regra de negócio (permitir animal sem imagem?). Assumindo que não pode:
            return res.status(400).json({ message: "Falha no processamento das imagens. O animal deve ter pelo menos uma imagem." });
        }

        // 4. Converte array final de URLs (objetos) para string JSON
        const imagemUrlJsonString = JSON.stringify(finalImageUrlsAsObjects);

        // 5. Atualiza dados no banco de dados
        const sql = `
            UPDATE animais SET
            nome = ?, idade = ?, cor = ?, sexo = ?, porte = ?, descricao = ?,
            especie = ?, raca = ?, id_situacao = ?, imagem_url = ?
            WHERE id_animal = ? AND id_usuario = ?`; // Garante que só atualize se for o dono
        const values = [
            nome, idade, cor, sexo, porte, descricao, especie, raca,
            id_situacao, imagemUrlJsonString,
            idAnimal, requestingUserId // Condições do WHERE
        ];

        console.log(`Atualizando animal ${idAnimal} no banco de dados...`);
        const [result] = await db.query(sql, values);
        console.log("Resultado da atualização:", result);

        // 6. Verifica se a atualização teve efeito
        // Verifica se alguma linha foi afetada OU se alguma linha foi modificada (caso os dados sejam idênticos)
        if (result.affectedRows > 0 || result.changedRows > 0) {
            console.log(`Animal ID ${idAnimal} atualizado com sucesso.`);
            return res.status(200).json({ message: "Animal atualizado com sucesso!" });
        } else {
            
            console.warn(`Atualização para animal ${idAnimal} (usuário ${requestingUserId}) não resultou em linhas afetadas ou modificadas. Dados podem ser idênticos.`);
            return res.status(200).json({ message: "Nenhuma alteração detectada, mas a operação foi concluída." }); // Mensagem mais informativa
        }

    } catch (error) {
        console.error(`Erro durante a atualização do animal ID ${idAnimal}:`, error);
        res.status(500).json({
            error: 'Erro no servidor ao atualizar o animal.',
            details: error.message
        });
    }
};

// --- Função para EXCLUIR um animal (IMPLEMENTADA AGORA) ---
const excluirAnimal = async (req, res) => {
    const idAnimal = parseInt(req.params.idAnimal);
    const idUsuario = req.body.id_usuario;
    
    console.log(`Tentativa de exclusão - Animal: ${idAnimal}, Usuário: ${idUsuario}`);

    if (isNaN(idAnimal)) {
        return res.status(400).json({ message: "ID do animal inválido." });
    }
    if (!idUsuario) {
        return res.status(400).json({ message: "ID do usuário é obrigatório no corpo da requisição." });
    }

    try {
        const [animal] = await db.query('SELECT id_usuario FROM animais WHERE id_animal = ?', [idAnimal]);
        
        if (!animal.length) {
            return res.status(404).json({ message: "Animal não encontrado." });
        }
        if (animal[0].id_usuario !== parseInt(idUsuario)) {
            return res.status(403).json({ message: "Ação não autorizada." });
        }

        await db.query('DELETE FROM favoritos WHERE animal_id = ?', [idAnimal]);
        await db.query('DELETE FROM animais WHERE id_animal = ?', [idAnimal]);
        
        return res.status(204).end();
    } catch (error) {
        console.error('Erro na exclusão:', error);
        return res.status(500).json({ error: 'Erro interno no servidor' });
    }
};

// --- Função para buscar animais favoritos de um usuário ---
const getFavoritedAnimalsByUser = async (req, res) => {
    // (Implementação mantida da resposta anterior)
    console.log(`Iniciando busca de animais favoritos para usuário ${req.params.idUsuario}`);
    const idUsuario = parseInt(req.params.idUsuario);
    if (isNaN(idUsuario)) { return res.status(400).json({ message: 'ID do usuário inválido.' }); }
    try {
        const sql = ` SELECT a.id_animal, a.nome, a.especie, a.raca, a.idade, a.cor, a.porte, a.sexo, a.descricao, a.imagem_url, a.id_situacao, a.data_cadastro, a.id_usuario FROM animais a JOIN favoritos uf ON a.id_animal = uf.animal_id WHERE uf.user_id = ? ORDER BY a.id_animal`;
        const [rows] = await db.query(sql, [idUsuario]);
        if (rows.length === 0) { console.log(`Nenhum favorito encontrado para usuário ${idUsuario}`); return res.status(200).json([]); }
        const favoritedAnimais = rows.map(row => { const imagensUrls = parseImagemUrl(row.imagem_url, row.id_animal); return { id: row.id_animal, nome: row.nome, especie: row.especie, raca: row.raca, idade: row.idade, cor: row.cor, porte: row.porte, sexo: row.sexo, descricao: row.descricao, imagens: imagensUrls, id_situacao: row.id_situacao, data_cadastro: row.data_cadastro, id_usuario: row.id_usuario, is_favorited: true }; });
        return res.status(200).json(favoritedAnimais);
    } catch (error) { console.error(`Erro ao buscar animais favoritos para usuário ${idUsuario}:`, error); res.status(500).json({ error: 'Erro no servidor ao buscar favoritos.' }); }
};

// --- Exporte todas as funções ---
module.exports = {
    cadastrarAnimal,          // Implementada
    getAnimaisByUser,
    getAnimalById,
    listAndFilterAnimais,
    toggleFavoriteStatus,
    atualizarAnimal,          // Implementada
    excluirAnimal,            // Implementada
    getFavoritedAnimalsByUser
};