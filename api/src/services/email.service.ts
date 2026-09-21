import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { query } from '../config/database';
import { configuracoesSmtpService } from '../modules/configuracoes-smtp/configuracoes-smtp.service';

dotenv.config();

// Não existe SMTP "da casa" para e-mail de cliente: cada empresa envia pela conta que
// ela mesma configurou em Config. E-mail. Sem configuração, o envio falha com aviso —
// nunca sai pela conta de outra empresa nem pelo SMTP do servidor (regra de 16/09/2026).
// O SMTP do .env só existe para o e-mail institucional (`remetenteDuoFuturo`), que o
// passa explicitamente.
export const ERRO_SEM_SMTP =
  'O e-mail da sua empresa ainda não está configurado. Configure em Config. E-mail para enviar.';

function transporterDe(c: SmtpCredentials) {
  return nodemailer.createTransport({
    host: c.smtp_host,
    port: c.smtp_port,
    secure: c.smtp_port === 465,
    auth: { user: c.smtp_user, pass: c.smtp_pass },
  });
}

function exigirCredenciais(c?: SmtpCredentials): SmtpCredentials {
  if (!c?.smtp_user || !c?.smtp_pass || !c?.smtp_host) throw new Error(ERRO_SEM_SMTP);
  return c;
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

/**
 * Remetente institucional da DuoFuturo — boas-vindas e suporte.
 *
 * Primeiro tenta o SMTP que a PRÓPRIA conta DuoFuturo cadastrou no sistema
 * (`configuracoes_smtp` da empresa do usuário `suporte@duofuturo.tech`, a 32):
 * é lá que mora o `suporte@duofuturo.tech`, numa conta Brevo com o domínio
 * autenticado. O SMTP do `.env` é OUTRA conta Brevo (a da Futuron), onde esse
 * remetente não existe — mandar por ela sairia recusado ou sem DKIM do domínio.
 *
 * Sem configuração ativa, cai no SMTP do processo, como sempre foi: o endereço
 * vem de `EMAIL_FROM_DUOFUTURO` e, sem ele, do `EMAIL_FROM`. Uma boas-vindas que
 * sai com o endereço antigo é melhor do que uma que não sai. O nome exibido é
 * sempre o pedido — o padrão do processo é "Cobrança", que não serve para dar
 * as boas-vindas nem para responder um chamado.
 */
export async function remetenteDuoFuturo(nomeExibido = 'DuoFuturo'): Promise<SmtpCredentials | undefined> {
  try {
    const email = process.env.DUOFUTURO_REMETENTE_EMAIL || 'suporte@duofuturo.tech';
    const res = await query(
      `SELECT c.empresa_id FROM configuracoes_smtp c
         JOIN usuarios u ON u.empresa_id = c.empresa_id
        WHERE u.email = $1 AND c.ativo = true AND c.smtp_pass_enc IS NOT NULL
        LIMIT 1`,
      [email]
    );
    const empresaId = res.rows[0]?.empresa_id;
    const cfg = empresaId ? await configuracoesSmtpService.getDecrypted(empresaId) : null;
    if (cfg?.smtp_pass) {
      return {
        smtp_host: cfg.smtp_host,
        smtp_port: Number(cfg.smtp_port),
        smtp_user: cfg.smtp_user,
        smtp_pass: cfg.smtp_pass,
        email_from: cfg.email_from,
        email_from_name: nomeExibido,
      };
    }
  } catch (err: any) {
    console.warn('[email] SMTP da conta DuoFuturo indisponível, usando o do processo —', err?.message || err);
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return undefined;

  return {
    smtp_host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
    smtp_port: Number(process.env.SMTP_PORT || 587),
    smtp_user: user,
    smtp_pass: pass,
    email_from: process.env.EMAIL_FROM_DUOFUTURO || process.env.EMAIL_FROM || user,
    email_from_name: nomeExibido,
  };
}

/** Função genérica para enviar qualquer e-mail */
export const enviarEmail = async (
  to: string,
  subject: string,
  html: string,
  smtpCredentials?: SmtpCredentials,
  anexos?: EmailAnexo[],
  /**
   * Versão em texto puro (parte `text/plain`). E-mail só com HTML leva
   * `MIME_HTML_ONLY` no SpamAssassin e pesa contra nos filtros da Microsoft.
   * Opcional: quem não passa segue como sempre foi.
   */
  texto?: string
): Promise<{ success: boolean; messageId: string; to: string }> => {
  const cred = exigirCredenciais(smtpCredentials);
  const fromEmail = cred.email_from || cred.smtp_user;
  const fromName = cred.email_from_name || 'Gestão Financeira';
  const transporter = transporterDe(cred);

  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    ...(texto ? { text: texto } : {}),
    attachments: anexos?.map(a => ({ filename: a.filename, path: a.path })),
  });

  console.log(`✅ E-mail enviado para ${to} | messageId: ${info.messageId}`);
  return { success: true, messageId: info.messageId, to };
};

export const enviarEmailCobrancaParcela = async (
  data: EmailParcelaAtrasada,
  smtpCredentials?: SmtpCredentials
): Promise<any> => {
  const cred = exigirCredenciais(smtpCredentials);
  const fromEmail = cred.email_from || cred.smtp_user;
  const fromName = cred.email_from_name || 'Cobrança';
  const assunto = `Notificação de Pagamento - Parcela ${data.numeroParcela}/${data.totalParcelas} em Atraso`;
  const html = createParcelaAtrasadaEmail(data);
  const transporter = transporterDe(cred);

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
