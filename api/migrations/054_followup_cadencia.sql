-- Migration 054: Cadência multi-passo de follow-up por estágio
--
-- Antes: cada estágio tinha UMA mensagem agendada (followup_config = objeto único).
-- Agora: o estágio pode ter uma CADÊNCIA de vários toques (D0 → D+1 → D+3 …),
-- guardada em followup_config.passos[] (array). Cada passo tem seu próprio
-- atraso/tipo/mensagem e uma "base": a partir da ENTRADA no estágio ou a partir
-- da MENSAGEM ANTERIOR (encadeado sobre o horário agendado do passo anterior).
--
-- Retrocompatível: um followup_config sem `passos` (shape antigo) é lido como uma
-- cadência de 1 passo (base='entrada') pelo backend — nenhuma config existente quebra.
--
-- Novo shape de estagios_funil.followup_config (JSONB):
--   { ativo, passos: [ { base:'entrada'|'anterior', tipo, mensagem, instrucao_ia,
--                        media_url, media_mimetype, media_filename,
--                        modo, atraso_dias, atraso_unidade, data_fixa,
--                        hora_envio, dias_semana } , ... ] }

BEGIN;

-- Cada follow-up agendado guarda sua posição na cadência e se, ao ser enviado,
-- deve disparar o "mover lead após envio" (estagios_funil.estagio_apos_envio_id).
-- Só o ÚLTIMO passo da cadência move o lead — os intermediários não.
ALTER TABLE followups_agendados
  ADD COLUMN IF NOT EXISTS passo_ordem      INTEGER,
  ADD COLUMN IF NOT EXISTS mover_apos_envio BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN followups_agendados.passo_ordem      IS 'Posição do passo na cadência do estágio (0 = primeiro); NULL para follow-ups de lead avulsos';
COMMENT ON COLUMN followups_agendados.mover_apos_envio IS 'Se true, ao enviar dispara o mover-após-envio do estágio. Só o último passo da cadência marca true';

-- Registros existentes (single-step) mantêm o comportamento atual: default true já
-- garante que continuam movendo o lead após o envio. Nada a migrar nos dados.

COMMIT;
