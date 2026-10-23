-- 098 — Modelo de reserva também no follow-up avulso do card (04/10/2026).
--
-- No número oficial, com a janela de 24h do lead fechada, a Meta só entrega modelo
-- aprovado. A cadência do estágio já tinha a reserva por passo (no followup_config do
-- estágio, lida na hora do envio); o follow-up agendado no card não tinha onde guardar
-- uma — e falhava com `sem_modelo` sempre que o lead não tivesse escrito nas últimas 24h.
--
-- Fica no próprio registro: o avulso não tem config viva para consultar.
-- Rodar como postgres.

ALTER TABLE followups_agendados ADD COLUMN IF NOT EXISTS modelo_whatsapp JSONB;

COMMENT ON COLUMN followups_agendados.modelo_whatsapp IS
  'Follow-up avulso (origem lead) no número oficial: modelo aprovado que sai no lugar da mensagem quando a janela de 24h está fechada. {nome, idioma, variaveis[], cabecalho}. A cadência do estágio usa o do followup_config.';
