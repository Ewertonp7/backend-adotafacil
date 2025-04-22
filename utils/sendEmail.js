const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail(to, subject, text) {
  const msg = {
    to,
    from: process.env.EMAIL_FROM, // e-mail verificado no SendGrid
    subject,
    text,
  };

  try {
    await sgMail.send(msg);
    console.log(`E-mail enviado para ${to}`);
  } catch (error) {
    console.error('Erro ao enviar o e-mail:', error.response ? error.response.body : error.message);
    throw new Error('Erro ao enviar o e-mail');
  }
}

module.exports = sendEmail;