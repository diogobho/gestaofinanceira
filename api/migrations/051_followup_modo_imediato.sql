-- Migration 051: Modo de agendamento "imediato"
--
-- Adiciona o modo 'imediato' ao padrão único de agendamento: o follow-up é
-- enviado assim que o lead entra no estágio (ou ao criar no card), sem esperar
-- hora_envio/dias_semana. Na prática o registro é criado com agendado_para = agora
-- e o job de follow-up (roda a cada minuto) envia no próximo ciclo (latência ≤ 1 min).
--
-- A coluna modo é VARCHAR(8); 'imediato' tem exatamente 8 caracteres.

BEGIN;

ALTER TABLE followups_agendados
  DROP CONSTRAINT IF EXISTS followups_agendados_modo_check;

ALTER TABLE followups_agendados
  ADD CONSTRAINT followups_agendados_modo_check
  CHECK (modo IN ('dias', 'data', 'imediato'));

COMMENT ON COLUMN followups_agendados.modo IS 'dias = após atraso_dias | data = data_fixa | imediato = ao entrar no estágio (≤1 min)';

COMMIT;
