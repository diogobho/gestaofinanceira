-- Migration 052: Unidade de medida no atraso do follow-up ("Após X ...")
--
-- O modo 'dias' passa a aceitar unidade de medida: minuto, hora ou dia.
--   - dia:    base + X dias, no hora_envio (comportamento anterior)
--   - hora:   base + X horas, no instante exato (fallback hora_envio em dia bloqueado)
--   - minuto: base + X minutos, no instante exato (fallback hora_envio em dia bloqueado)
-- atraso_dias continua guardando a QUANTIDADE (X); atraso_unidade guarda a unidade.
--
-- O modo 'imediato' é aposentado: "Após 0 minutos" é o equivalente. Migramos os
-- registros/configs existentes de 'imediato' → dias/0/minuto (o disparo já agendado
-- não muda, pois agendado_para permanece).

BEGIN;

ALTER TABLE followups_agendados
  ADD COLUMN IF NOT EXISTS atraso_unidade VARCHAR(8) NOT NULL DEFAULT 'dia'
    CHECK (atraso_unidade IN ('minuto', 'hora', 'dia'));

COMMENT ON COLUMN followups_agendados.atraso_dias    IS 'Modo dias: QUANTIDADE (X) de atraso — a unidade está em atraso_unidade';
COMMENT ON COLUMN followups_agendados.atraso_unidade IS 'Unidade do atraso: minuto | hora | dia';

-- Aposenta 'imediato' → dias/0/minuto (mantém agendado_para, hora_envio, dias_semana).
UPDATE followups_agendados
   SET modo = 'dias', atraso_dias = 0, atraso_unidade = 'minuto'
 WHERE modo = 'imediato';

UPDATE estagios_funil
   SET followup_config = followup_config
       || '{"modo":"dias","atraso_dias":0,"atraso_unidade":"minuto"}'::jsonb
 WHERE followup_config->>'modo' = 'imediato';

UPDATE automacoes
   SET config = config
       || '{"modo":"dias","atraso_dias":0,"atraso_unidade":"minuto"}'::jsonb
 WHERE tipo_acao = 'followup' AND config->>'modo' = 'imediato';

COMMIT;
