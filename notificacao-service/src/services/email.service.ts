import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

function createTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '465');
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export interface EmailData {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export const sendEmail = async (data: EmailData): Promise<any> => {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER;
  const fromName = process.env.EMAIL_FROM_NAME || 'Cobrança';

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP não configurado. Defina SMTP_USER e SMTP_PASS no .env');
  }

  const transporter = createTransporter();

  const info = await transporter.sendMail({
    from: data.from || `"${fromName}" <${fromEmail}>`,
    to: data.to,
    subject: data.subject,
    html: data.html,
  });

  console.log('✅ E-mail enviado com sucesso:', {
    to: data.to,
    subject: data.subject,
    messageId: info.messageId,
  });

  return info;
};

export const createPaymentReminderEmail = (clienteNome: string, valorMensalidade?: number): string => {
  const valorTexto = valorMensalidade
    ? `no valor de <strong>R$ ${Number(valorMensalidade).toFixed(2).replace('.', ',')}</strong>`
    : '';

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Lembrete de Pagamento</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .info { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔔 Lembrete de Pagamento</h1>
        </div>
        <div class="content">
          <p>Olá <strong>${clienteNome}</strong>,</p>

          <div class="info">
            <p><strong>Este é um lembrete amigável!</strong></p>
            <p>Seu pagamento ${valorTexto} vence <strong>amanhã</strong>.</p>
          </div>

          <p>Para manter seus serviços ativos, não esqueça de realizar o pagamento até a data de vencimento.</p>

          <p><strong>Opções de pagamento:</strong></p>
          <ul>
            <li>Transferência bancária ou PIX</li>
            <li>Entre em contato para outras formas de pagamento</li>
          </ul>

          <p>Após efetuar o pagamento, envie o comprovante para agilizar a confirmação.</p>

          <div style="text-align: center;">
            <a href="mailto:futuroncontato@gmail.com" class="button">Entrar em Contato</a>
          </div>
        </div>
        <div class="footer">
          <p>Este é um e-mail automático. Por favor, não responda.</p>
          <p>&copy; ${new Date().getFullYear()} Sistema de Gestão Financeira</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const createPaymentOverdueEmail = (clienteNome: string, diasAtraso: number, valorMensalidade?: number): string => {
  const valorTexto = valorMensalidade
    ? `no valor de <strong>R$ ${Number(valorMensalidade).toFixed(2).replace('.', ',')}</strong>`
    : '';

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Pagamento em Atraso</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
        .alert { background: #fee; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>⚠️ Pagamento em Atraso</h1>
        </div>
        <div class="content">
          <p>Olá <strong>${clienteNome}</strong>,</p>

          <div class="alert">
            <p><strong>Identificamos que seu pagamento está vencido há ${diasAtraso} dia(s)</strong> ${valorTexto}.</p>
          </div>

          <p>Para evitar a suspensão do serviço, solicitamos que regularize sua situação o mais breve possível.</p>

          <p><strong>Como regularizar:</strong></p>
          <ul>
            <li>Entre em contato conosco através dos canais de atendimento</li>
            <li>Efetue o pagamento via transferência bancária ou PIX</li>
            <li>Envie o comprovante de pagamento</li>
          </ul>

          <p>Caso já tenha efetuado o pagamento, por favor, desconsidere este e-mail e nos envie o comprovante.</p>

          <div style="text-align: center;">
            <a href="mailto:futuroncontato@gmail.com" class="button">Entrar em Contato</a>
          </div>
        </div>
        <div class="footer">
          <p>Este é um e-mail automático. Por favor, não responda.</p>
          <p>&copy; ${new Date().getFullYear()} Sistema de Gestão Financeira</p>
        </div>
      </div>
    </body>
    </html>
  `;
};
