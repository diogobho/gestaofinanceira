import { query } from '../../config/database';
import { encrypt, decrypt } from '../../utils/crypto';
import nodemailer from 'nodemailer';

export interface SmtpConfig {
  id?: number;
  empresa_id: number;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass?: string; // plain text (only for input/output, never stored)
  email_from: string;
  email_from_name: string;
  ativo: boolean;
  testado_em?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const configuracoesSmtpService = {
  async getByEmpresa(empresa_id: number): Promise<SmtpConfig | null> {
    const result = await query(
      `SELECT id, empresa_id, smtp_host, smtp_port, smtp_user,
              email_from, email_from_name, ativo, testado_em, created_at, updated_at
       FROM configuracoes_smtp
       WHERE empresa_id = $1`,
      [empresa_id]
    );
    return result.rows[0] || null;
  },

  async getDecrypted(empresa_id: number): Promise<SmtpConfig | null> {
    const result = await query(
      `SELECT * FROM configuracoes_smtp WHERE empresa_id = $1`,
      [empresa_id]
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      ...row,
      smtp_pass: row.smtp_pass_enc ? decrypt(row.smtp_pass_enc) : undefined,
    };
  },

  async upsert(empresa_id: number, data: Partial<SmtpConfig>): Promise<SmtpConfig> {
    const existing = await query(
      `SELECT id FROM configuracoes_smtp WHERE empresa_id = $1`,
      [empresa_id]
    );

    const smtp_pass_enc = data.smtp_pass ? encrypt(data.smtp_pass) : undefined;

    if (existing.rows.length > 0) {
      // UPDATE — only update smtp_pass_enc if new password provided
      const setClauses: string[] = [
        'smtp_host = $2',
        'smtp_port = $3',
        'smtp_user = $4',
        'email_from = $5',
        'email_from_name = $6',
        'ativo = $7',
        'updated_at = CURRENT_TIMESTAMP',
      ];
      const params: any[] = [
        empresa_id,
        data.smtp_host || 'smtp-relay.brevo.com',
        data.smtp_port || 587,
        data.smtp_user,
        data.email_from,
        data.email_from_name || 'Cobrança',
        data.ativo !== undefined ? data.ativo : true,
      ];

      if (smtp_pass_enc) {
        setClauses.push(`smtp_pass_enc = $${params.length + 1}`);
        params.push(smtp_pass_enc);
      }

      const result = await query(
        `UPDATE configuracoes_smtp SET ${setClauses.join(', ')}
         WHERE empresa_id = $1
         RETURNING id, empresa_id, smtp_host, smtp_port, smtp_user,
                   email_from, email_from_name, ativo, testado_em, created_at, updated_at`,
        params
      );
      return result.rows[0];
    } else {
      // INSERT
      if (!smtp_pass_enc) {
        throw new Error('Senha SMTP obrigatória no primeiro cadastro.');
      }
      const result = await query(
        `INSERT INTO configuracoes_smtp
           (empresa_id, smtp_host, smtp_port, smtp_user, smtp_pass_enc, email_from, email_from_name, ativo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, empresa_id, smtp_host, smtp_port, smtp_user,
                   email_from, email_from_name, ativo, testado_em, created_at, updated_at`,
        [
          empresa_id,
          data.smtp_host || 'smtp-relay.brevo.com',
          data.smtp_port || 587,
          data.smtp_user,
          smtp_pass_enc,
          data.email_from,
          data.email_from_name || 'Cobrança',
          data.ativo !== undefined ? data.ativo : true,
        ]
      );
      return result.rows[0];
    }
  },

  async delete(empresa_id: number): Promise<void> {
    await query(`DELETE FROM configuracoes_smtp WHERE empresa_id = $1`, [empresa_id]);
  },

  async testar(empresa_id: number, email_destino: string): Promise<void> {
    const config = await this.getDecrypted(empresa_id);
    if (!config) throw new Error('Configuração SMTP não encontrada.');
    if (!config.smtp_pass) throw new Error('Senha SMTP não configurada.');

    const transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: false,
      auth: { user: config.smtp_user, pass: config.smtp_pass },
    });

    await transporter.sendMail({
      from: `"${config.email_from_name}" <${config.email_from}>`,
      to: email_destino,
      subject: '✅ Teste de configuração SMTP',
      html: `<p>Olá!</p><p>Sua configuração de e-mail está funcionando corretamente.</p>
             <p>Empresa ID: ${empresa_id} | Host: ${config.smtp_host}</p>`,
    });

    await query(
      `UPDATE configuracoes_smtp SET testado_em = CURRENT_TIMESTAMP WHERE empresa_id = $1`,
      [empresa_id]
    );
  },
};
