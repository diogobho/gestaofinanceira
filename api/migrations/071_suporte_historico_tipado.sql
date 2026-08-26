-- Migration 071 — histórico do ticket tipado (Fase 1)
--
-- `ticket_mensagens` guardava só `autor` (cliente | agente_ia | suporte). Isso
-- responde "quem escreveu", mas não "o que é esta linha" — e a Central precisa de
-- três coisas que não são fala para o cliente:
--
--   nota_interna  observação da equipe, invisível ao cliente;
--   evento        registro automático (status mudou, prioridade mudou, anexo entrou);
--   mensagem      o que de fato foi dito ao cliente (o que já existia).
--
-- Fica tudo na MESMA tabela, de propósito: o valor do histórico é ser único e
-- ordenado. Tabela separada para nota interna obrigaria a intercalar dois SELECTs
-- por timestamp na aplicação — e a ordem é justamente o que se quer preservar.
--
-- `visivel_cliente` é uma coluna à parte, e não derivada de `tipo`, porque as duas
-- perguntas são independentes: um evento pode ser visível ("chamado resolvido") ou
-- não ("prioridade alterada para alta"), e no futuro pode existir nota que a equipe
-- decide expor. Derivar uma da outra criaria um acoplamento que já se sabe errado.
--
-- Backfill: tudo que existe hoje é fala real, do cliente ou da equipe, e o cliente
-- já viu. Então `mensagem` + visível. Não há linha ambígua no banco (são 3 chamados
-- de teste, todos fechados).
--
-- ATENÇÃO: `ticket_mensagens` pertence ao usuário `postgres`. Rode como ele:
--   sudo -u postgres psql -d gestao_financeira -f 071_suporte_historico_tipado.sql

BEGIN;

ALTER TABLE ticket_mensagens
  ADD COLUMN IF NOT EXISTS tipo            varchar(20)  NOT NULL DEFAULT 'mensagem',
  ADD COLUMN IF NOT EXISTS visivel_cliente boolean      NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_mensagens_tipo_check') THEN
    ALTER TABLE ticket_mensagens
      ADD CONSTRAINT ticket_mensagens_tipo_check
      CHECK (tipo IN ('mensagem', 'nota_interna', 'evento'));
  END IF;
END $$;

-- Nota interna nunca é visível ao cliente. A regra vive no banco porque é a única
-- garantia que não depende de ninguém lembrar dela na próxima rota que for escrita.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_mensagens_nota_privada') THEN
    ALTER TABLE ticket_mensagens
      ADD CONSTRAINT ticket_mensagens_nota_privada
      CHECK (tipo <> 'nota_interna' OR visivel_cliente = false);
  END IF;
END $$;

-- A leitura do cliente é sempre (ticket + visível), ordenada no tempo.
CREATE INDEX IF NOT EXISTS idx_ticket_mensagens_visiveis
  ON ticket_mensagens (ticket_id, created_at)
  WHERE visivel_cliente = true;

COMMENT ON COLUMN ticket_mensagens.tipo IS
  'mensagem (fala com o cliente) | nota_interna (só a equipe) | evento (registro automático)';
COMMENT ON COLUMN ticket_mensagens.visivel_cliente IS
  'Se o cliente vê esta linha. Independente de `tipo`: evento pode ser visível, nota interna nunca é';

-- ── Primeira resposta, para a métrica da Fase 7 ─────────────────────────────
-- Tempo de primeira resposta é a pergunta que mais se faz de um suporte, e
-- calculá-la por subconsulta em `ticket_mensagens` a cada leitura fica caro à
-- medida que o histórico cresce. A coluna é carimbada uma vez, quando a equipe
-- responde pela primeira vez, e nunca mais muda.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS primeira_resposta_at timestamptz;

COMMENT ON COLUMN tickets.primeira_resposta_at IS
  'Quando a EQUIPE respondeu pela primeira vez. Carimbado uma única vez; base do tempo de primeira resposta';

-- Backfill: chamado que já tem resposta da equipe recebe a data da primeira delas.
UPDATE tickets t
   SET primeira_resposta_at = sub.quando
  FROM (
    SELECT ticket_id, MIN(created_at) AS quando
      FROM ticket_mensagens
     WHERE autor = 'suporte'
     GROUP BY ticket_id
  ) sub
 WHERE sub.ticket_id = t.id
   AND t.primeira_resposta_at IS NULL;

COMMIT;
