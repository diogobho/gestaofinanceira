-- 096 — Andamento do histórico da coexistência por FASE (02/10/2026).
-- A primeira conexão real (conta #7) mostrou que os pedaços chegam fora de ordem: a
-- fase 2 bateu 100% antes de a fase 1 terminar, e o status virou "concluído" com 66%.
-- Guardar o maior progresso de cada fase resolve: concluído = as três em 100.
-- Rodar como postgres (dono da tabela).
ALTER TABLE whatsapp_cloud_contas
  ADD COLUMN IF NOT EXISTS historico_fases JSONB NOT NULL DEFAULT '{}'::jsonb;
