const nodemailer = require('nodemailer');

// Carrega as variáveis de ambiente. Certifique-se de que seu app carrega o .env
require('dotenv').config();

// Configura o "transportador" que fará a mágica do envio usando o Gmail
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER, // O seu email do Gmail que está no .env
        pass: process.env.EMAIL_APP_PASSWORD // A SENHA DE APP que você gerou
    }
});

/**
 * Função para enviar o email de recuperação de senha.
 * @param {string} emailDestino - O email do usuário que receberá o código.
 * @param {string} codigo - O código de recuperação a ser enviado.
 */
const enviarEmailRecuperacao = async (emailDestino, codigo) => {
    const mailOptions = {
        from: `"AdotaFácil" <${process.env.EMAIL_USER}>`,
        to: emailDestino,
        subject: 'Código de Recuperação de Senha - AdotaFácil',
        html: `
            <div style="font-family: Arial, sans-serif; text-align: center; color: #333; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #002574;">Recuperação de Senha</h2>
                <p>Olá,</p>
                <p>Recebemos uma solicitação para redefinir a senha da sua conta no AdotaFácil.</p>
                <p>Use o código abaixo para continuar:</p>
                <p style="font-size: 28px; font-weight: bold; letter-spacing: 3px; background-color: #f2f2f2; padding: 12px 18px; border-radius: 5px; display: inline-block;">
                    ${codigo}
                </p>
                <p style="font-size: 12px; color: #888;">Este código expira em 10 minutos.</p>
                <p>Se você não fez esta solicitação, pode ignorar este email com segurança.</p>
                <hr style="border: 0; border-top: 1px solid #ddd; margin: 20px 0;">
                <p style="font-size: 12px; color: #888;">Atenciosamente,<br>Equipe AdotaFácil</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email de recuperação enviado com sucesso para ${emailDestino}`);
        return true; // Retorna true se o envio foi bem-sucedido
    } catch (error) {
        console.error(`Falha ao enviar email para ${emailDestino}:`, error);
        return false; // Retorna false se houve erro
    }
};

module.exports = { enviarEmailRecuperacao };