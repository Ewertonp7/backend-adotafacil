const bcrypt = require("bcryptjs");
const db = require("../config/db");
// ADICIONADO: Importa nosso novo serviço de email
const { enviarEmailRecuperacao } = require('../services/emailService');

// REMOVIDO: A configuração e importação do Sendgrid não são mais necessárias.
// sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

function gerarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 dígitos
}

// Enviar código para o usuário
exports.enviarCodigo = async (req, res) => {
  const { email, documento, isCnpj } = req.body;
  console.log('Requisição recebida para enviar código:', req.body);

  if (!email || !documento) {
    return res.status(400).json({ erro: "Preencha e-mail e documento." });
  }

  try {
    const campo = isCnpj ? "cnpj" : "cpf";
    const [result] = await db.query(
      `SELECT * FROM usuarios WHERE email = ? AND ${campo} = ?`,
      [email, documento]
    );

    if (result.length === 0) {
      return res.status(404).json({ erro: "Usuário não encontrado com os dados informados." });
    }

    const [codigoExistente] = await db.query(
      'SELECT * FROM recuperacao_senha WHERE email = ? AND expira > NOW()',
      [email]
    );

    if (codigoExistente.length > 0) {
      return res.status(400).json({ erro: "Um código de recuperação já foi enviado. Verifique seu e-mail, inclusive a caixa de spam." });
    }

    const codigo = gerarCodigo();
    const expira = new Date(Date.now() + 10 * 60 * 1000); // Expira em 10 minutos

    await db.query(
      'INSERT INTO recuperacao_senha (email, codigo, expira) VALUES (?, ?, ?)',
      [email, codigo, expira]
    );

    // ALTERADO: Troca do Sendgrid pelo Nodemailer
    const emailEnviadoComSucesso = await enviarEmailRecuperacao(email, codigo);

    if (!emailEnviadoComSucesso) {
        // Se o email falhar, não adianta continuar. Retorna um erro.
        return res.status(500).json({ erro: "Houve uma falha ao enviar o e-mail. Tente novamente mais tarde." });
    }

    return res.json({ mensagem: "Código de recuperação enviado para o seu e-mail." });
  } catch (error) {
    console.error("Erro no processo de enviar código:", error);
    return res.status(500).json({ erro: "Erro interno do servidor ao processar sua solicitação." });
  }
};

// A função confirmarCodigo permanece a mesma, não precisa de alteração.
exports.confirmarCodigo = async (req, res) => {
  const { email, codigo, novaSenha } = req.body;

  if (!email || !codigo || !novaSenha) {
    return res.status(400).json({ erro: "Dados incompletos." });
  }

  try {
    const [registro] = await db.query(
      'SELECT * FROM recuperacao_senha WHERE email = ? AND codigo = ?',
      [email, codigo]
    );

    if (registro.length === 0) {
      return res.status(400).json({ erro: "Código inválido ou já utilizado." });
    }

    if (new Date() > new Date(registro[0].expira)) {
      await db.query('DELETE FROM recuperacao_senha WHERE email = ?', [email]);
      return res.status(400).json({ erro: "Código expirado. Por favor, solicite um novo." });
    }

    const senhaCriptografada = await bcrypt.hash(novaSenha, 10);

    await db.query("UPDATE usuarios SET senha = ? WHERE email = ?", [
      senhaCriptografada,
      email,
    ]);

    await db.query('DELETE FROM recuperacao_senha WHERE email = ?', [email]);

    return res.json({ mensagem: "Senha atualizada com sucesso." });
  } catch (error) {
    console.error("Erro ao confirmar código e atualizar senha:", error);
    return res.status(500).json({ erro: "Erro ao atualizar senha." });
  }
};

// A função alterarSenha permanece a mesma, não precisa de alteração.
exports.alterarSenha = async (req, res) => {
  const { email, novaSenha } = req.body;

  if (!email || !novaSenha) {
    return res.status(400).json({ erro: "Dados incompletos." });
  }

  try {
    const senhaCriptografada = await bcrypt.hash(novaSenha, 10);

    await db.query("UPDATE usuarios SET senha = ? WHERE email = ?", [
      senhaCriptografada,
      email,
    ]);

    return res.json({ mensagem: "Senha atualizada com sucesso." });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return res.status(500).json({ erro: "Erro ao atualizar senha." });
  }
};