const bcrypt = require("bcryptjs");
const sendgrid = require("@sendgrid/mail");
const db = require("../config/db");

sendgrid.setApiKey(process.env.SENDGRID_API_KEY);

const codigos = {}; // Armazenamento temporário em memória: { email: { codigo, expira } }

function gerarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 dígitos
}

// Enviar código para o usuário
exports.enviarCodigo = async (req, res) => {
  const { email, documento, isCnpj } = req.body;
  console.log('Requisição recebida:', req.body);

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
      return res.status(404).json({ erro: "Usuário não encontrado." });
    }

    // Verifica se já existe um código de recuperação ativo
    const [codigoExistente] = await db.query(
      'SELECT * FROM recuperacao_senha WHERE email = ? AND expira > NOW()',
      [email]
    );

    if (codigoExistente.length > 0) {
      return res.status(400).json({ erro: "Já existe um código ativo. Verifique seu e-mail." });
    }

    const codigo = gerarCodigo();
    const expira = new Date(Date.now() + 10 * 60 * 1000); // Expira em 10 minutos

    // Salvar no banco de dados
    await db.query(
      'INSERT INTO recuperacao_senha (email, codigo, expira) VALUES (?, ?, ?)',
      [email, codigo, expira]
    );

    // Enviar o e-mail com o código
    await sendgrid.send({
      to: email,
      from: "ewerton.lucio78@gmail.com", // Troque pelo seu e-mail verificado
      subject: "Código de Recuperação de Senha",
      text: `Seu código é: ${codigo}`,
      html: `<p>Seu código de verificação é: <strong>${codigo}</strong></p>`
    });

    return res.json({ mensagem: "Código enviado." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Erro ao enviar o código." });
  }
};

// Confirmar o código de recuperação e atualizar a senha
exports.confirmarCodigo = async (req, res) => {
  const { email, codigo, novaSenha } = req.body;

  if (!email || !codigo || !novaSenha) {
    return res.status(400).json({ erro: "Dados incompletos." });
  }

  try {
    // Buscar o código no banco de dados
    const [registro] = await db.query(
      'SELECT * FROM recuperacao_senha WHERE email = ? AND codigo = ?',
      [email, codigo]
    );

    if (registro.length === 0) {
      return res.status(400).json({ erro: "Código inválido." });
    }

    // Verificar se o código não expirou
    if (new Date() > new Date(registro[0].expira)) {
      // Excluir o código expirado
      await db.query('DELETE FROM recuperacao_senha WHERE email = ?', [email]);
      return res.status(400).json({ erro: "Código expirado." });
    }

    // Criptografar a nova senha
    const senhaCriptografada = await bcrypt.hash(novaSenha, 10);

    // Atualizar a senha no banco de dados
    await db.query("UPDATE usuarios SET senha = ? WHERE email = ?", [
      senhaCriptografada,
      email,
    ]);

    // Excluir o código após o uso
    await db.query('DELETE FROM recuperacao_senha WHERE email = ?', [email]);

    return res.json({ mensagem: "Senha atualizada com sucesso." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ erro: "Erro ao atualizar senha." });
  }
};

// Alterar a senha diretamente, caso o usuário já tenha um novo código
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
    console.error(error);
    return res.status(500).json({ erro: "Erro ao atualizar senha." });
  }
};