-- ============================================================================
-- 070 — Idempotência do follow-up e origem da mensagem no histórico
--
-- Duas correções que dependem de coluna nova:
--
-- 1. CLAIM ATÔMICO (followups_agendados)
--    O scheduler lia a fila e depois enviava. Entre as duas coisas nada segurava
--    o registro: um restart do PM2 no meio do envio deixava o follow-up 'pendente'
--    com a mensagem JÁ ENVIADA — e o ciclo seguinte mandava de novo. O `continuaPendente()`
--    só reduzia a janela; continuava sendo check-then-act, não exclusão mútua.
--    Agora o ciclo RECLAMA o registro (UPDATE ... WHERE status='pendente') e só o
--    vencedor envia. `claim_at` permite a um "reaper" resolver claims órfãos, e
--    `tentativas` dá um teto para qualquer retry — sem ele, erro transitório
--    perpétuo (chip banido devolve 503, que parece transitório) reprocessaria para
--    sempre.
--
-- 2. ORIGEM DA MENSAGEM (historico_mensagens)
--    O intervalo anti-ban media "última saída da empresa", contando a conversa
--    manual do operador. Operador ativo empurrava a fila de follow-up
--    indefinidamente. Sem saber QUEM originou cada mensagem não dá para separar
--    conversa humana de automação. Coluna nullable e SEM backfill de propósito: a
--    janela de consulta do anti-ban é de 1 hora, então as linhas antigas (NULL)
--    saem de cena sozinhas em vez de serem adivinhadas.
--
-- Ambas as tabelas pertencem ao usuário `postgres`. Rode como ele:
--   sudo -u postgres psql -d gestao_financeira -f 070_followup_claim_e_origem_mensagem.sql
-- ============================================================================

-- ── 1. Claim atômico ────────────────────────────────────────────────────────
ALTER TABLE followups_agendados
  ADD COLUMN IF NOT EXISTS tentativas INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claim_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS erro_categoria VARCHAR(32);

-- 'processando' = reclamado por um ciclo, envio em andamento. buscarPendentes não
-- enxerga esse status, então nenhum outro ciclo/worker pega o mesmo registro.
ALTER TABLE followups_agendados DROP CONSTRAINT IF EXISTS followups_agendados_status_check;
ALTER TABLE followups_agendados
  ADD CONSTRAINT followups_agendados_status_check
  CHECK (status IN ('pendente', 'processando', 'enviado', 'falhou', 'cancelado'));

-- A fila é lida a cada minuto filtrando status + agendado_para.
CREATE INDEX IF NOT EXISTS idx_followups_fila
  ON followups_agendados (status, agendado_para)
  WHERE status IN ('pendente', 'processando');

COMMENT ON COLUMN followups_agendados.tentativas IS
  'Falhas acumuladas. Teto de retry: ao estourar, vira falhou em vez de reprocessar para sempre';
COMMENT ON COLUMN followups_agendados.claim_at IS
  'Quando este follow-up foi reclamado por um ciclo (status=processando). Claim órfão é resolvido pelo reaper';
COMMENT ON COLUMN followups_agendados.erro_categoria IS
  'Categoria do último erro: ia_credencial, canal_bloqueado, canal_desconectado, destino_invalido, transitorio, conflito_config';

-- ── 2. Origem da mensagem ───────────────────────────────────────────────────
ALTER TABLE historico_mensagens
  ADD COLUMN IF NOT EXISTS origem VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'historico_origem_check') THEN
    ALTER TABLE historico_mensagens
      ADD CONSTRAINT historico_origem_check
      CHECK (origem IS NULL OR origem IN
        ('manual', 'followup', 'disparo', 'agente_ia', 'lembrete', 'recebida'));
  END IF;
END $$;

-- Índice do espaçamento anti-ban: última saída AUTOMÁTICA por CHIP (usuario_id).
CREATE INDEX IF NOT EXISTS idx_historico_antiban
  ON historico_mensagens (usuario_id, enviado_at DESC)
  WHERE direcao = 'saida' AND erro IS NULL AND origem IS NOT NULL;

COMMENT ON COLUMN historico_mensagens.origem IS
  'Quem originou a mensagem: manual (operador), followup, disparo, agente_ia, lembrete, recebida. NULL = anterior à migration 070';
