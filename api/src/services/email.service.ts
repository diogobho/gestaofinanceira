import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Cria o transporter usando SMTP (Gmail ou qualquer SMTP configurado no .env)
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

export interface EmailParcelaAtrasada {
  clienteNome: string;
  clienteEmail: string;
  valorParcela: number;
  numeroParcela: number;
  totalParcelas: number;
  diasAtraso: number;
  descricao: string;
  mentorNome?: string;
  mentorEmail?: string;
  mentorTelefone?: string;
}

const createParcelaAtrasadaEmail = (data: EmailParcelaAtrasada): string => {
  const valorFormatado = `R$ ${Number(data.valorParcela).toFixed(2).replace('.', ',')}`;
  const dataVencimento = new Date();
  dataVencimento.setDate(dataVencimento.getDate() - data.diasAtraso);
  const dataVencimentoFormatada = dataVencimento.toLocaleDateString('pt-BR');

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Notificação de Pagamento</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #1f2937;
          background-color: #f3f4f6;
        }
        .email-wrapper { background-color: #f3f4f6; padding: 40px 20px; }
        .email-container {
          max-width: 600px;
          margin: 0 auto;
          background: #ffffff;
          border-radius: 12px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          overflow: hidden;
        }
        .header {
          background: #ffffff;
          padding: 32px 40px 24px;
          border-bottom: 1px solid #e5e7eb;
        }
        .header h1 {
          font-size: 24px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 8px;
        }
        .header p {
          font-size: 14px;
          color: #6b7280;
        }
        .content {
          padding: 32px 40px;
        }
        .greeting {
          font-size: 16px;
          color: #374151;
          margin-bottom: 24px;
        }
        .status-badge {
          display: inline-block;
          background: #fef3c7;
          color: #92400e;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 24px;
        }
        .card {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          padding: 24px;
          margin: 20px 0;
          border-radius: 8px;
        }
        .card-title {
          font-size: 14px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 16px;
        }
        .info-row {
          display: flex;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .info-row:last-child { border-bottom: none; }
        .info-label {
          font-size: 14px;
          color: #6b7280;
        }
        .info-value {
          font-size: 14px;
          color: #111827;
          font-weight: 500;
          text-align: right;
        }
        .amount-highlight {
          font-size: 28px;
          font-weight: 700;
          color: #111827;
          margin: 24px 0;
          text-align: center;
        }
        .divider {
          height: 1px;
          background: #e5e7eb;
          margin: 24px 0;
        }
        .contact-section {
          background: #f0f9ff;
          border: 1px solid #bfdbfe;
          padding: 20px;
          border-radius: 8px;
          margin: 24px 0;
        }
        .contact-title {
          font-size: 14px;
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 12px;
        }
        .contact-info {
          font-size: 14px;
          color: #1e40af;
          margin: 8px 0;
        }
        .contact-info a {
          color: #1e40af;
          text-decoration: none;
          font-weight: 500;
        }
        .cta-button {
          display: inline-block;
          background: #2563eb !important;
          color: #ffffff !important;
          padding: 14px 32px;
          text-decoration: none !important;
          border-radius: 6px;
          font-size: 15px;
          font-weight: 500;
          margin: 24px 0;
        }
        .cta-button:hover {
          background: #1d4ed8 !important;
        }
        .cta-wrapper {
          text-align: center;
        }
        .note {
          font-size: 13px;
          color: #6b7280;
          background: #f9fafb;
          padding: 16px;
          border-radius: 6px;
          margin: 24px 0;
          border-left: 3px solid #d1d5db;
        }
        .footer {
          text-align: center;
          padding: 32px 40px;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
        }
        .footer p {
          font-size: 13px;
          color: #9ca3af;
          margin: 6px 0;
        }
        @media only screen and (max-width: 600px) {
          .email-wrapper { padding: 20px 10px; }
          .header, .content, .footer { padding: 24px 20px; }
          .amount-highlight { font-size: 24px; }
        }
      </style>
    </head>
    <body>
      <div class="email-wrapper">
        <div class="email-container">
          <div class="header">
            <h1>Notificação de Pagamento</h1>
            <p>Identificamos uma pendência em sua conta</p>
          </div>

          <div class="content">
            <p class="greeting">Olá, <strong>${data.clienteNome}</strong></p>

            <div class="status-badge">⏰ Pagamento em Atraso</div>

            <p style="margin-bottom: 24px; color: #374151;">
              Identificamos que o pagamento da parcela abaixo não foi realizado até a data de vencimento.
              Por favor, regularize sua situação para evitar suspensão do serviço.
            </p>

            <div class="amount-highlight">${valorFormatado}</div>

            <div class="card">
              <div class="card-title">Detalhes do Pagamento</div>
              <div class="info-row">
                <span class="info-label">Descrição</span>
                <span class="info-value">${data.descricao}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Parcela</span>
                <span class="info-value">${data.numeroParcela} de ${data.totalParcelas}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Vencimento</span>
                <span class="info-value">${dataVencimentoFormatada}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Dias em atraso</span>
                <span class="info-value" style="color: #dc2626;">${data.diasAtraso} ${data.diasAtraso === 1 ? 'dia' : 'dias'}</span>
              </div>
            </div>

            ${data.mentorNome ? `
            <div class="contact-section">
              <div class="contact-title">📞 Dados para Contato</div>
              <div class="contact-info"><strong>Responsável:</strong> ${data.mentorNome}</div>
              ${data.mentorEmail ? `<div class="contact-info"><strong>E-mail:</strong> <a href="mailto:${data.mentorEmail}">${data.mentorEmail}</a></div>` : ''}
            </div>
            ` : ''}

            ${data.mentorEmail ? `
            <div class="cta-wrapper">
              <a href="mailto:${data.mentorEmail}" class="cta-button">Entrar em Contato</a>
            </div>
            ` : ''}

            <div class="note">
              <strong>Importante:</strong> Caso já tenha efetuado o pagamento, por favor desconsidere esta mensagem
              e envie o comprovante para confirmação.
            </div>
          </div>

          <div class="footer">
            <p>Este é um e-mail automático. Por favor, não responda.</p>
            <p>&copy; ${new Date().getFullYear()} Sistema de Gestão Financeira</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

export interface SmtpCredentials {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  email_from: string;
  email_from_name: string;
}

export interface EmailAnexo {
  filename: string;
  path: string;
}

/** Função genérica para enviar qualquer e-mail */
export const enviarEmail = async (
  to: string,
  subject: string,
  html: string,
  smtpCredentials?: SmtpCredentials,
  anexos?: EmailAnexo[]
): Promise<{ success: boolean; messageId: string; to: string }> => {
  const smtpUser = smtpCredentials?.smtp_user || process.env.SMTP_USER;
  const smtpPass = smtpCredentials?.smtp_pass || process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP não configurado. Configure as credenciais de e-mail nas configurações da empresa.');
  }

  const fromEmail = smtpCredentials?.email_from || process.env.EMAIL_FROM || smtpUser;
  const fromName = smtpCredentials?.email_from_name || process.env.EMAIL_FROM_NAME || 'Gestão Financeira';

  const transporter = smtpCredentials
    ? nodemailer.createTransport({
        host: smtpCredentials.smtp_host,
        port: smtpCredentials.smtp_port,
        secure: smtpCredentials.smtp_port === 465,
        auth: { user: smtpCredentials.smtp_user, pass: smtpCredentials.smtp_pass },
      })
    : createTransporter();

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    attachments: anexos?.map(a => ({ filename: a.filename, path: a.path })),
  });

  console.log(`✅ E-mail enviado para ${to} | messageId: ${info.messageId}`);
  return { success: true, messageId: info.messageId, to };
};

export const enviarEmailCobrancaParcela = async (
  data: EmailParcelaAtrasada,
  smtpCredentials?: SmtpCredentials
): Promise<any> => {
  const smtpUser = smtpCredentials?.smtp_user || process.env.SMTP_USER;
  const smtpPass = smtpCredentials?.smtp_pass || process.env.SMTP_PASS;

  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP não configurado. Configure as credenciais de e-mail nas configurações da empresa.');
  }

  const fromEmail = smtpCredentials?.email_from || process.env.EMAIL_FROM || smtpUser;
  const fromName = smtpCredentials?.email_from_name || process.env.EMAIL_FROM_NAME || 'Cobrança';
  const assunto = `Notificação de Pagamento - Parcela ${data.numeroParcela}/${data.totalParcelas} em Atraso`;
  const html = createParcelaAtrasadaEmail(data);

  const transporter = smtpCredentials
    ? nodemailer.createTransport({
        host: smtpCredentials.smtp_host,
        port: smtpCredentials.smtp_port,
        secure: false,
        auth: { user: smtpCredentials.smtp_user, pass: smtpCredentials.smtp_pass },
      })
    : createTransporter();

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: data.clienteEmail,
    subject: assunto,
    html,
  });

  console.log(`✅ E-mail de cobrança enviado para ${data.clienteEmail} | messageId: ${info.messageId}`);

  return {
    success: true,
    messageId: info.messageId,
    clienteEmail: data.clienteEmail,
  };
};
