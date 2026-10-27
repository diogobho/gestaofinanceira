-- Migration 031: Suporte a múltiplos provedores de IA no agente_ia_config
ALTER TABLE agente_ia_config
  ADD COLUMN IF NOT EXISTS provider       VARCHAR(20)  NOT NULL DEFAULT 'claude',
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
