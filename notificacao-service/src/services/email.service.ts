import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import fs from 'fs';
import { createDecipheriv } from 'crypto';
import { query } from '../config/database';

dotenv.config();

// Cada empresa cobra os próprios clientes pela conta de e-mail que ELA configurou
// (configuracoes_smtp). Não há SMTP de reserva: empresa sem configuração não envia
// (regra de 16/09/2026 — nada de uma conta é usado por outra).
//
// A senha está cifrada com a SMTP_ENCRYPTION_KEY da API. A chave é lida do .env da
// API, que é onde ela mora — sem uma segunda cópia aqui.
const ENV_DA_API = '/var/www/apps/gestao_financeira/api/.env';

function chaveSmtp(): Buffer {
  let hex = process.env.SMTP_ENCRYPTION_KEY || '';
  if (!hex) {
    try { hex = dotenv.parse(fs.readFileSync(ENV_DA_API)).SMTP_ENCRYPTION_KEY || ''; } catch { /* sem .env */ }
  }
  if (hex.length !== 64) throw new Error('SMTP_ENCRYPTION_KEY indisponível');
  return Buffer.from(hex, 'hex');
}

function decifrar(encoded: string): string {
  const [ivHex, encHex] = encoded.split(':');
  if (!ivHex || !encHex) throw new Error('Senha SMTP em formato inválido');
  const decipher = createDecipheriv('aes-256-cbc', chaveSmtp(), Buffer.from(ivHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

export interface SmtpEmpresa {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  fromName: string;
}

/** SMTP ativo da empresa dona do usuário, ou null. */
export const smtpDoUsuario = async (usuarioId: number): Promise<SmtpEmpresa | null> => {
  const r = await query(
    `SELECT c.smtp_host, c.smtp_port, c.smtp_user, c.smtp_pass_enc, c.email_from, c.email_from_name
       FROM usuarios u
       JOIN configuracoes_smtp c ON c.empresa_id = u.empresa_id
      WHERE u.id = $1 AND c.ativo = true AND c.smtp_pass_enc IS NOT NULL`,
    [usuarioId]
  );
  const c = r.rows[0];
  if (!c?.smtp_host || !c?.smtp_user) return null;
  return {
    host: c.smtp_host,
    port: Number(c.smtp_port),
    user: c.smtp_user,
    pass: decifrar(c.smtp_pass_enc),
    from: c.email_from || c.smtp_user,
    fromName: c.email_from_name || 'Cobrança',
  };
};

export interface EmailData {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (data: EmailData, smtp: SmtpEmpresa): Promise<any> => {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  const info = await transporter.sendMail({
    from: `"${smtp.fromName}" <${smtp.from}>`,
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
