-- Migration 035: Configurações SMTP por empresa
-- Permite que cada empresa configure suas próprias credenciais de e-mail (Brevo/SMTP)

CREATE TABLE IF NOT EXISTS configuracoes_smtp (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER UNIQUE NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  smtp_host VARCHAR(255) NOT NULL DEFAULT 'smtp-relay.brevo.com',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user VARCHAR(255) NOT NULL,
  smtp_pass_enc TEXT NOT NULL,
  email_from VARCHAR(255) NOT NULL,
  email_from_name VARCHAR(255) NOT NULL DEFAULT 'Cobrança',
  ativo BOOLEAN DEFAULT true,
  testado_em TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_configuracoes_smtp_empresa ON configuracoes_smtp(empresa_id);
