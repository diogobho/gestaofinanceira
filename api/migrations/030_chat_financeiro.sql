-- Migration 030: Chat Financeiro Pessoal (Agente IA para usuários PF)
-- Config global gerenciada pelo super_admin
CREATE TABLE IF NOT EXISTS chat_financeiro_config (
  id SERIAL PRIMARY KEY,
  api_key TEXT,
  modelo VARCHAR DEFAULT 'claude-sonnet-4-6',
  ativo BOOLEAN DEFAULT true,
  max_tokens INT DEFAULT 2048,
  contexto_mensagens INT DEFAULT 20,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed: garante que existe exatamente 1 registro de config
INSERT INTO chat_financeiro_config (ativo)
SELECT true WHERE NOT EXISTS (SELECT 1 FROM chat_financeiro_config);

-- Histórico de conversas por usuário
CREATE TABLE IF NOT EXISTS chat_financeiro_historico (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  conteudo TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_hist_usuario
  ON chat_financeiro_historico(usuario_id, created_at);
