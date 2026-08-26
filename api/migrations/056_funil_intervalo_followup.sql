-- Migration 056: Intervalo anti-ban entre envios de follow-up, GLOBAL por empresa
--
-- Quando follow-ups acumulam e o scheduler dispara vários, o espaçamento entre
-- um envio e outro reduz a chance de banimento pela Meta. O intervalo (mín/máx em
-- segundos) é global por empresa e fica em empresas.config (jsonb). O scheduler
-- envia no máximo um follow-up por empresa por ciclo, respeitando o intervalo
-- desde o último envio daquela empresa.
--
-- Obs.: uma versão anterior desta migration criou colunas em `funis`
-- (followup_intervalo_min/max_seg). Elas são removidas aqui — o escopo é por empresa.

BEGIN;

ALTER TABLE funis
  DROP COLUMN IF EXISTS followup_intervalo_min_seg,
  DROP COLUMN IF EXISTS followup_intervalo_max_seg;

-- Semear os defaults (45/90s) para empresas que ainda não têm a config definida.
UPDATE empresas
SET config = COALESCE(config, '{}'::jsonb)
              || jsonb_build_object(
                   'followup_intervalo_min_seg', 45,
                   'followup_intervalo_max_seg', 90
                 )
WHERE config IS NULL
   OR NOT (config ? 'followup_intervalo_min_seg');

COMMIT;
