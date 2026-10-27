-- Migration 040: Janela de horário para follow-ups
-- Adiciona campos de restrição de horário e dias da semana

ALTER TABLE followups_agendados
  ADD COLUMN IF NOT EXISTS hora_inicio VARCHAR(5) DEFAULT NULL,   -- ex: '08:00'
  ADD COLUMN IF NOT EXISTS hora_fim    VARCHAR(5) DEFAULT NULL,   -- ex: '18:00'
  ADD COLUMN IF NOT EXISTS dias_semana INTEGER[]  DEFAULT NULL;   -- 0=Dom..6=Sáb, NULL=todos

-- Adicionar campos na coluna followup_config dos estágios (já é JSONB, apenas documenta)
-- followup_config agora suporta: { ativo, tipo, mensagem, instrucao_ia, intervalo_horas,
--   hora_inicio, hora_fim, dias_semana }
COMMENT ON COLUMN followups_agendados.hora_inicio IS 'Hora mínima de envio (HH:MM), NULL = sem restrição';
COMMENT ON COLUMN followups_agendados.hora_fim    IS 'Hora máxima de envio (HH:MM), NULL = sem restrição';
COMMENT ON COLUMN followups_agendados.dias_semana IS 'Dias permitidos (0=Dom..6=Sáb), NULL = todos';
