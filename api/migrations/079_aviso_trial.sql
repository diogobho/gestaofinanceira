-- 079 — Aviso de fim de teste grátis (1 dia antes)
--
-- `assinaturas` pertence ao `postgres`: rode como ele e mantenha o GRANT,
-- senão a API não enxerga a coluna nova (mesma pegadinha da 067).
--
-- Um carimbo por assinatura é o que torna o aviso idempotente: o job marca
-- com `UPDATE ... WHERE aviso_trial_em IS NULL RETURNING`, então mesmo que
-- ele rode duas vezes (ou em duas instâncias do cluster) o cliente recebe
-- um e-mail só. Quem recomeça um teste zera a coluna e volta a ser avisado.

ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS aviso_trial_em timestamptz;

COMMENT ON COLUMN assinaturas.aviso_trial_em IS
  'Quando saiu o e-mail avisando que falta 1 dia para o teste acabar. NULL = ainda não avisado.';

-- Índice parcial: o job varre só quem está em teste e ainda não foi avisado.
CREATE INDEX IF NOT EXISTS idx_assinaturas_aviso_trial
  ON assinaturas (trial_expira_em)
  WHERE status = 'trial' AND aviso_trial_em IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON assinaturas TO gestao_user;
