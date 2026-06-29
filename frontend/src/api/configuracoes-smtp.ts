import api from './client';

export interface SmtpConfig {
  id?: number;
  empresa_id: number;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass?: string;
  email_from: string;
  email_from_name: string;
  ativo: boolean;
  testado_em?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const configuracoesSmtpApi = {
  async get(): Promise<SmtpConfig | null> {
    const res = await api.get('/configuracoes-smtp');
    return res.data;
  },

  async save(data: Partial<SmtpConfig>): Promise<SmtpConfig> {
    const res = await api.put('/configuracoes-smtp', data);
    return res.data;
  },

  async delete(): Promise<void> {
    await api.delete('/configuracoes-smtp');
  },

  async testar(email_destino: string): Promise<{ success: boolean; message: string }> {
    const res = await api.post('/configuracoes-smtp/testar', { email_destino });
    return res.data;
  },
};
