-- Migration 026: Adicionar delay de resposta ao agente IA
ALTER TABLE agente_ia_config ADD COLUMN IF NOT EXISTS delay_segundos INTEGER DEFAULT 0;
