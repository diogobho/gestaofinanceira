-- Migration 034: Adiciona suporte a Gemini no chat_financeiro_config
ALTER TABLE chat_financeiro_config
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'claude',
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
