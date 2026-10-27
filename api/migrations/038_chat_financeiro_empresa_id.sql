-- Migration 038: Isolamento multi-tenant para chat_financeiro_config
-- Adiciona empresa_id para que cada empresa tenha sua própria configuração do chat financeiro
-- ao invés de compartilhar uma única configuração global (que expunha a API key entre empresas).
--
-- Estratégia: empresa_id NULL = config global / fallback (preserva linha existente).
--             empresa_id preenchido = config exclusiva dessa empresa.
--             O service tenta empresa_id primeiro; cai no fallback global se não encontrar.

ALTER TABLE chat_financeiro_config
  ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

-- Índice único: uma config por empresa (NULL = fallback global para backward compat)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_financeiro_config_empresa_id
  ON chat_financeiro_config(empresa_id)
  WHERE empresa_id IS NOT NULL;
