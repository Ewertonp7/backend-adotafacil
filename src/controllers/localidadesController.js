const db = require('../config/db');

const getCidadesPorEstado = async (req, res) => {
    const { uf } = req.params; // Pega a sigla do estado da URL, ex: 'MG'
    
    if (!uf || uf.length !== 2) {
        return res.status(400).json({ erro: 'UF do estado inválida.' });
    }

    try {
        // Passo 1: Achar o ID do estado correspondente à UF na sua nova tabela 'estado'
        const [estados] = await db.query('SELECT id FROM estado WHERE uf = ?', [uf.toUpperCase()]);

        if (estados.length === 0) {
            return res.status(404).json({ erro: 'Estado não encontrado.' });
        }
        const estadoId = estados[0].id;

        // Passo 2: Usar o ID do estado para buscar as cidades na sua nova tabela 'cidade'
        const [cidades] = await db.query(
            'SELECT nome FROM cidade WHERE uf = ? ORDER BY nome ASC', 
            [estadoId]
        );
        
        // Mapeia para um array de strings simples, que é o que o Flutter precisa
        const nomesCidades = cidades.map(c => c.nome);
        
        res.json(nomesCidades);
    } catch (error) {
        console.error(`Erro ao buscar cidades para a UF ${uf}:`, error);
        res.status(500).json({ erro: 'Erro interno no servidor ao buscar cidades.' });
    }
};

module.exports = {
    getCidadesPorEstado
};