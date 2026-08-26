-- ============================================================================
-- 069 — anotacoes_lead.origem: quem escreveu a anotação
--
-- O agente grava uma anotação a cada follow-up enviado ("Follow-up automático
-- enviado: ...") e o prompt injeta as 20 últimas anotações do lead. Sem saber a
-- origem, o agente relia as PRÓPRIAS mensagens como se fossem observações escritas
-- por um vendedor humano — eco que virava contexto falso a cada novo toque.
--
-- A coluna não substitui `tipo` (nota/importante/lembrete, que é a CLASSIFICAÇÃO da
-- anotação): ela diz o AUTOR. Por isso uma coluna nova, e não mais um valor no CHECK
-- de `tipo` — que quebraria as telas que mapeiam tipo → ícone/cor.
--
--   usuario → escrita por uma pessoa na interface (padrão, e o que existia até aqui)
--   agente  → escrita pelo agente de IA pela ferramenta criar_anotacao
--   sistema → registro automático (follow-up enviado, resultado de formulário)
-- ATENÇÃO: `anotacoes_lead` pertence ao usuário `postgres`, não ao `gestao_user`.
-- Rode como postgres (igual às migrations 064 e 067):
--   sudo -u postgres psql -d gestao_financeira -f 069_anotacoes_origem.sql
-- ============================================================================

ALTER TABLE anotacoes_lead
  ADD COLUMN IF NOT EXISTS origem VARCHAR(20) NOT NULL DEFAULT 'usuario';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'anotacoes_origem_check'
  ) THEN
    ALTER TABLE anotacoes_lead
      ADD CONSTRAINT anotacoes_origem_check
      CHECK (origem IN ('usuario', 'agente', 'sistema'));
  END IF;
END $$;

-- Backfill do que já está no banco: as anotações de rastreabilidade do follow-up
-- automático são o caso que motivou a coluna. O texto é gerado pelo código
-- (agente-ia.service.processarFollowUpIA), então o LIKE é exato, não heurístico.
UPDATE anotacoes_lead
   SET origem = 'sistema'
 WHERE origem = 'usuario'
   AND conteudo LIKE 'Follow-up automático enviado:%';

COMMENT ON COLUMN anotacoes_lead.origem IS
  'Autor da anotação: usuario (pessoa), agente (IA) ou sistema (registro automático)';
