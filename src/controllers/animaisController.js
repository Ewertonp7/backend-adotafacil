const { v4: uuidv4 } = require('uuid');
const db = require('../config/db');
const path = require('path');
const { BlobServiceClient } = require('@azure/storage-blob');

// Suas configurações e helpers do Azure (mantidos do seu arquivo)
const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME;
const AZURE_STORAGE_SAS_TOKEN = process.env.AZURE_STORAGE_SAS_TOKEN;

if (!AZURE_STORAGE_ACCOUNT_NAME || !AZURE_STORAGE_CONTAINER_NAME || !AZURE_STORAGE_SAS_TOKEN) {
    console.error("ERRO CRÍTICO: Variáveis de ambiente do Azure Storage não definidas!");
}

const getBlobServiceClient = () => {
    const blobServiceUrl = `https://${AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`;
    return new BlobServiceClient(`${blobServiceUrl}?${AZURE_STORAGE_SAS_TOKEN}`);
};

const uploadImageToAzure = async (fileBuffer, originalName) => {
    if (!fileBuffer || !originalName) throw new Error("Buffer ou nome original do arquivo inválido para upload.");
    const blobServiceClient = getBlobServiceClient();
    const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);
    const fileExtension = path.extname(originalName) || '.jpg';
    const blobName = `animais/${uuidv4()}${fileExtension}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.uploadData(fileBuffer, { blobHTTPHeaders: { blobContentType: 'image/jpeg' } });
    return blockBlobClient.url;
};

const parseImagemUrl = (imagemUrlData, animalId) => {
    let imagensUrls = [];
    if (!imagemUrlData) return imagensUrls;
    try {
        let parsedImages = typeof imagemUrlData === 'string' ? JSON.parse(imagemUrlData) : imagemUrlData;
        if (Array.isArray(parsedImages)) {
            imagensUrls = parsedImages.map(item => item?.url).filter(url => url);
        }
    } catch (e) {
        if (typeof imagemUrlData === 'string' && imagemUrlData.startsWith('http')) {
            imagensUrls = [imagemUrlData];
        } else {
            console.error('Erro ao parsear imagem_url para ID', animalId, e);
        }
    }
    return imagensUrls;
};


// --- FUNÇÕES DO CONTROLLER ---

// Sua função original, sem alterações
// SUBSTITUA sua função cadastrarAnimal por esta:
const cadastrarAnimal = async (req, res) => {
    // Adicionado 'meses' na desestruturação
    const { id_usuario, nome, idade, meses, cor, detalhes_cor, sexo, porte, descricao, especie, raca, id_situacao } = req.body;

    if (!id_usuario || !nome || cor === undefined || sexo === undefined || porte === undefined || especie === undefined || raca === undefined || id_situacao === undefined) {
        return res.status(400).json({ message: "Dados obrigatórios faltando para cadastrar o animal." });
    }
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: "Nenhuma imagem enviada para o cadastro." });
    }

    try {
        const uploadedImageUrls = [];
        for (const file of req.files) {
            const imageUrl = await uploadImageToAzure(file.buffer, file.originalname);
            uploadedImageUrls.push({ url: imageUrl });
        }

        const imagemUrlJsonString = JSON.stringify(uploadedImageUrls);

        // Query corrigida com 14 colunas e 13 placeholders + NOW()
        const sql = `
            INSERT INTO animais (id_usuario, nome, idade, meses, cor, detalhes_cor, sexo, porte, descricao, especie, raca, id_situacao, imagem_url, data_cadastro)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`;

        // Array de valores corrigido com 13 itens na ordem correta
        const values = [
            id_usuario, nome, idade || 0, meses || 0, cor, detalhes_cor, sexo, porte, 
            descricao, especie, raca, id_situacao, imagemUrlJsonString
        ];

        const [result] = await db.query(sql, values);

        if (result.affectedRows > 0) {
            return res.status(201).json({ message: "Animal cadastrado com sucesso!", id_animal: result.insertId });
        } else {
            throw new Error("Nenhuma linha afetada ao inserir no banco de dados.");
        }
    } catch (error) {
        console.error("Erro durante o cadastro do animal:", error);
        res.status(500).json({ error: 'Erro no servidor ao cadastrar o animal.', details: error.message });
    }
};

// Sua função original, sem alterações
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


// <<<< FUNÇÃO ATUALIZADA >>>>
const getAnimalById = async (req, res) => {
    const idAnimal = parseInt(req.params.idAnimal);
    const { id_usuario } = req.query; 

    if (isNaN(idAnimal)) { return res.status(400).json({ message: 'ID do animal inválido.' }); }

    try {
        const sql = `
            SELECT a.*, u.nome AS nome_usuario, u.telefone AS telefone_usuario,
                   CASE WHEN fav.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorited
            FROM animais a
            LEFT JOIN usuarios u ON a.id_usuario = u.id_usuario
            LEFT JOIN favoritos fav ON a.id_animal = fav.animal_id AND fav.user_id = ?
            WHERE a.id_animal = ?`;
        const [rows] = await db.query(sql, [id_usuario || null, idAnimal]);

        if (rows.length === 0) { return res.status(404).json({ message: 'Animal não encontrado.' }); }

        const animalData = rows[0];
        const responseData = {
            ...animalData,
            imagens: parseImagemUrl(animalData.imagem_url, animalData.id_animal),
            is_favorited: animalData.is_favorited === 1,
            usuario: { nome: animalData.nome_usuario, telefone: animalData.telefone_usuario }
        };
        return res.status(200).json({ animal: responseData });
    } catch (error) {
        console.error(`Erro ao buscar animal com ID ${idAnimal}:`, error);
        res.status(500).json({ error: 'Erro no servidor ao buscar detalhes do animal.' });
    }
};

// Sua função original, mas com o JOIN e ORDER BY que fizemos antes
const listAndFilterAnimais = async (req, res) => {
    console.log('Iniciando busca e filtro de animais com JOIN de localização...');
    const { nome, raca, min_idade, max_idade, min_meses, max_meses, sexo, porte, busca, id_situacao, id_usuario, estado, cidade, bairro } = req.query;

    let sql = `
        SELECT
            a.id_animal, a.nome, a.especie, a.raca, a.idade, a.meses, a.cor, a.detalhes_cor, a.porte, a.sexo,
            a.descricao, a.imagem_url, a.id_situacao, a.data_cadastro, a.id_usuario,
            u.cidade, u.estado,
            CASE WHEN fav.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_favorited
        FROM animais AS a
        INNER JOIN usuarios AS u ON a.id_usuario = u.id_usuario
        LEFT JOIN favoritos AS fav ON a.id_animal = fav.animal_id AND fav.user_id = ?
        WHERE 1=1
    `;
                
    const values = [id_usuario ? parseInt(id_usuario) : null];
    
    const situacaoFiltro = id_situacao ? parseInt(id_situacao) : 1;
    sql += ` AND a.id_situacao = ?`;
    values.push(situacaoFiltro);

    // Filtros do animal
    if (nome) { sql += ` AND a.nome LIKE ?`; values.push(`%${nome}%`); }
    if (raca) { sql += ` AND a.raca LIKE ?`; values.push(`%${raca}%`); }
    if (sexo) { sql += ` AND a.sexo = ?`; values.push(sexo); }
    if (porte) { sql += ` AND a.porte = ?`; values.push(porte); }
    if (busca) { sql += ` AND (a.nome LIKE ? OR a.raca LIKE ? OR a.descricao LIKE ? OR a.especie LIKE ?)`; values.push(`%${busca}%`, `%${busca}%`, `%${busca}%`, `%${busca}%`); }

    if (min_idade || min_meses) {
        const totalMinMeses = (parseInt(min_idade || 0) * 12) + parseInt(min_meses || 0);
        // Usa IFNULL para tratar meses nulos no banco como 0
        sql += ` AND ((a.idade * 12) + IFNULL(a.meses, 0)) >= ?`;
        values.push(totalMinMeses);
    }
    if (max_idade || max_meses) {
        // Usa um valor alto como padrão para não limitar a busca se só um campo for preenchido
        const totalMaxMeses = (parseInt(max_idade || 100) * 12) + parseInt(max_meses || 11);
        sql += ` AND ((a.idade * 12) + IFNULL(a.meses, 0)) <= ?`;
        values.push(totalMaxMeses);
    }


    // Filtros de Localização (agora na tabela de usuários 'u')
    if (estado) { sql += ` AND u.estado = ?`; values.push(estado); }
    if (cidade) { sql += ` AND u.cidade = ?`; values.push(cidade); }
    if (bairro) { sql += ` AND u.bairro LIKE ?`; values.push(`%${bairro}%`); }
    
    // Lógica de ranqueamento
    sql += ` ORDER BY CASE WHEN LOWER(a.cor) = 'preto' THEN 0 ELSE 1 END ASC, a.idade DESC, a.meses DESC, a.data_cadastro DESC`;

    try {
        const [rows] = await db.query(sql, values);
        const animaisEncontrados = rows.map(row => {
            const imagensUrls = parseImagemUrl(row.imagem_url, row.id_animal);
            return { 
                id: row.id_animal, nome: row.nome, especie: row.especie, raca: row.raca, 
                idade: row.idade, meses: row.meses, cor: row.cor, detalhes_cor: row.detalhes_cor, porte: row.porte, 
                sexo: row.sexo, descricao: row.descricao, imagens: imagensUrls, 
                id_situacao: row.id_situacao, data_cadastro: row.data_cadastro, id_usuario: row.id_usuario, 
                is_favorited: row.is_favorited === 1,
                cidade: row.cidade,
                estado: row.estado
            };
        });
        return res.status(200).json(animaisEncontrados);
    } catch (error) { 
        console.error('Erro ao buscar/filtrar animais:', error); 
        res.status(500).json({ error: 'Erro no servidor ao buscar animais.' }); 
    }
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
// <<<< FUNÇÃO ATUALIZADA >>>>
const atualizarAnimal = async (req, res) => {
    const idAnimal = parseInt(req.params.idAnimal);
    const { id_usuario, nome, idade, meses, cor, detalhes_cor, sexo, porte, descricao, especie, raca, id_situacao, imagens_existentes } = req.body;
    const novasImagens = req.files || [];

    try {
        const [animalAtualRows] = await db.query('SELECT id_usuario FROM animais WHERE id_animal = ?', [idAnimal]);
        if (animalAtualRows.length === 0) return res.status(404).json({ message: "Animal não encontrado." });
        if (animalAtualRows[0].id_usuario !== parseInt(id_usuario)) return res.status(403).json({ message: "Ação não autorizada." });

        let finalImageUrls = [];
        if (imagens_existentes) {
            finalImageUrls = JSON.parse(imagens_existentes);
        }

        for (const file of novasImagens) {
            const imageUrl = await uploadImageToAzure(file.buffer, file.originalname);
            finalImageUrls.push(imageUrl);
        }

        const imagemUrlJsonString = JSON.stringify(finalImageUrls.map(url => ({ url: url })));

        const sql = `
            UPDATE animais SET nome = ?, idade = ?, meses = ?, cor = ?, detalhes_cor = ?, sexo = ?, porte = ?, 
            descricao = ?, especie = ?, raca = ?, id_situacao = ?, imagem_url = ?
            WHERE id_animal = ? AND id_usuario = ?`;
        
        const values = [
            nome, idade, meses || 0, cor, detalhes_cor, sexo, porte, descricao, especie, raca,
            id_situacao, imagemUrlJsonString, idAnimal, id_usuario
        ];

// Se o status está sendo mudado para "Adotado" (ID 2), remove de todos os favoritos.
if (parseInt(id_situacao) === 2) {
    console.log(`Animal ${idAnimal} marcado como adotado. Removendo de todas as listas de favoritos...`);
    await db.query('DELETE FROM favoritos WHERE animal_id = ?', [idAnimal]);
}

        await db.query(sql, values);
        return res.status(200).json({ message: "Animal atualizado com sucesso!" });
    } catch (error) {
        console.error(`Erro durante a atualização do animal ID ${idAnimal}:`, error);
        res.status(500).json({ error: 'Erro no servidor ao atualizar o animal.' });
    }
};

// --- Função para EXCLUIR um animal ---
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

        // Primeiro remove as dependências (favoritos)
        await db.query('DELETE FROM favoritos WHERE animal_id = ?', [idAnimal]);
        // Depois remove o animal
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
    cadastrarAnimal,
    getAnimaisByUser,
    getAnimalById, // Atualizada
    listAndFilterAnimais,
    toggleFavoriteStatus,
    atualizarAnimal, // Atualizada
    excluirAnimal,
    getFavoritedAnimalsByUser
};