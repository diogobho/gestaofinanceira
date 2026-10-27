-- Migration 048: Padrão único de agendamento de mensagens (estágio · lead · geral)
--
-- Unifica os parâmetros de agendamento em um único padrão:
--   modo ('dias' = após X dias | 'data' = data fixa), hora_envio (HH:MM exato),
--   dias_semana (com roll-forward para o próximo dia válido) e tipo de mensagem
--   (fixa/personalizada/agente_ia).
-- Remove os parâmetros divergentes antigos (janela hora_inicio/hora_fim).
-- Adiciona, no estágio, "mover lead após o ENVIO" (coexiste com "após a resposta").
--
-- DECISÃO DO USUÁRIO: apagar e começar limpo (backup feito antes em
-- api/backups/pre_agendamento_padrao_*).

BEGIN;

-- 1. Clean slate: remove agendamentos antigos e configs de followup dos estágios.
DELETE FROM followups_agendados;
UPDATE estagios_funil SET followup_config = NULL WHERE followup_config IS NOT NULL;

-- 2. followups_agendados: troca a janela antiga pelo padrão único.
ALTER TABLE followups_agendados
  DROP COLUMN IF EXISTS hora_inicio,
  DROP COLUMN IF EXISTS hora_fim,
  ADD COLUMN IF NOT EXISTS modo       VARCHAR(8) NOT NULL DEFAULT 'dias'
    CHECK (modo IN ('dias', 'data')),
  ADD COLUMN IF NOT EXISTS atraso_dias INTEGER,    -- modo='dias': X dias após a base
  ADD COLUMN IF NOT EXISTS data_fixa   DATE,        -- modo='data': data calendário do envio
  ADD COLUMN IF NOT EXISTS hora_envio  VARCHAR(5);  -- 'HH:MM' exato do disparo
-- dias_semana (INTEGER[] 0=Dom..6=Sáb, NULL=todos) é mantido como está.

COMMENT ON COLUMN followups_agendados.modo       IS 'dias = após atraso_dias | data = data_fixa';
COMMENT ON COLUMN followups_agendados.atraso_dias IS 'Modo dias: nº de dias após a base (entrada no estágio / criação no lead)';
COMMENT ON COLUMN followups_agendados.data_fixa   IS 'Modo data: data calendário do envio';
COMMENT ON COLUMN followups_agendados.hora_envio  IS 'Horário exato do envio (HH:MM); roll-forward usa dias_semana';

-- 3. Estágio: mover lead para outro estágio APÓS o envio da mensagem agendada.
--    Coexiste com estagios_funil.estagio_apos_resposta_id (mover após resposta).
ALTER TABLE estagios_funil
  ADD COLUMN IF NOT EXISTS estagio_apos_envio_id INTEGER
    REFERENCES estagios_funil(id) ON DELETE SET NULL;

-- Novo shape documentado de followup_config (JSONB):
--   { ativo, tipo, mensagem, instrucao_ia, modo, atraso_dias, data_fixa,
--     hora_envio, dias_semana, estagio_apos_envio_id }

COMMIT;
