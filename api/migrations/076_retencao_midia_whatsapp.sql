-- 076 — Cota de mídia do WhatsApp por empresa, com o arquivo mais antigo saindo primeiro.
--
-- Decisão de 15/09/2026: cada empresa guarda até 1 GB de mídia de conversa 1:1
-- (foto, áudio, vídeo, documento). Passou disso, o ARQUIVO mais antigo é apagado —
-- a mensagem continua no histórico, com o texto, e o balão diz que a mídia expirou.
-- Texto não tem limite: a maior conta (Panteras) tinha 137 MB de texto em 17 meses,
-- contra 10 GB de mídia.
--
-- Fora da cota, e nunca apagado por ela: arquivo que a automação reutiliza (anexo de
-- cadência, follow-up, lembrete, disparo) — é configuração, não conversa.
-- Grupo não guarda mídia nenhuma: não aparece no card e era 2/3 da mídia da Panteras.
--
-- A limpeza (jobs/midia-retencao-scheduler.ts) só apaga depois de um backup de
-- arquivos bem-sucedido nas últimas 26h (api/scripts/backup_diario.sh).

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS limite_midia_mb integer NOT NULL DEFAULT 1024
  CHECK (limite_midia_mb >= 0);

COMMENT ON COLUMN empresas.limite_midia_mb IS
  'Cota de mídia de conversa 1:1 do WhatsApp, em MB. Acima dela o arquivo mais antigo é apagado (migration 076).';

ALTER TABLE historico_mensagens
  ADD COLUMN IF NOT EXISTS midia_expirada_em timestamptz;

COMMENT ON COLUMN historico_mensagens.midia_expirada_em IS
  'Quando o arquivo da mídia foi apagado pela cota (ou por ser de grupo). A mensagem fica.';

CREATE INDEX IF NOT EXISTS idx_historico_midia_ativa
  ON historico_mensagens (empresa_id, enviado_at DESC)
  WHERE media_url IS NOT NULL AND midia_expirada_em IS NULL;

-- A limpeza confere, por arquivo, se outra linha (de outra empresa, ou 1:1 no caso de
-- grupo) aponta para o mesmo caminho antes de apagar.
CREATE INDEX IF NOT EXISTS idx_historico_media_url
  ON historico_mensagens (media_url)
  WHERE media_url IS NOT NULL;
