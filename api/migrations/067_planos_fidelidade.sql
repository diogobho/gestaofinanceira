-- Migration 067: fidelidade (trimestral/semestral/anual) e nova base de usuários
--
-- Duas mudanças que andam juntas porque as duas mexem no preço:
--
-- 1) FIDELIDADE. Cada plano passa a ter quatro compromissos. O preço guardado é
--    sempre o **equivalente mensal já com desconto** — o que se cobra por ciclo
--    é `preco_mensal * meses`. Guardar o mensal (e não o total do ciclo) é o que
--    deixa a tela comparar "R$ 169/mês no anual contra R$ 219/mês no mensal"
--    sem dividir nada, que é como o cliente pensa o gasto.
--
--      Starter       79   72   69   59
--      Profissional  219  199  189  169
--      Enterprise    397  359  339  299
--                    mês  tri  sem  ano
--
-- 2) BASE DE USUÁRIOS menor: Profissional 4 → 2 e Enterprise 6 → 4.
--    Quem JÁ paga não perde nada: a diferença vira cortesia, o mesmo mecanismo
--    da 061. Trial e cancelado entram nas regras novas — não são clientes.
--
-- Usuário adicional continua R$ 100/mês e **não** entra no desconto de
-- fidelidade: o desconto é do plano. No anual, 1 adicional custa 100 * 12.

BEGIN;

-- ── ciclos de fidelidade ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS planos_ciclos (
  id           serial PRIMARY KEY,
  plano_id     integer      NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
  ciclo        varchar(20)  NOT NULL,   -- mensal | trimestral | semestral | anual
  meses        smallint     NOT NULL,
  preco_mensal numeric(10,2) NOT NULL,  -- equivalente mensal, já com desconto
  asaas_cycle  varchar(20)  NOT NULL,   -- MONTHLY | QUARTERLY | SEMIANNUALLY | YEARLY
  ativo        boolean      NOT NULL DEFAULT true,
  UNIQUE (plano_id, ciclo)
);

COMMENT ON TABLE  planos_ciclos             IS 'Compromissos de fidelidade por plano; o preço é o equivalente mensal com desconto';
COMMENT ON COLUMN planos_ciclos.preco_mensal IS 'Equivalente mensal já com desconto — o cobrado por ciclo é preco_mensal * meses';
COMMENT ON COLUMN planos_ciclos.asaas_cycle  IS 'Valor aceito em cycle na API v3 do Asaas';

CREATE INDEX IF NOT EXISTS idx_planos_ciclos_plano ON planos_ciclos(plano_id);

-- As tabelas de plano pertencem ao postgres (esta migration roda como ele, igual
-- à 064). Sem o GRANT, a API — que conecta como gestao_user — não enxerga a
-- tabela nova e toda tela de plano quebra com "permission denied".
GRANT SELECT, INSERT, UPDATE, DELETE ON planos_ciclos TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE planos_ciclos_id_seq TO gestao_user;

INSERT INTO planos_ciclos (plano_id, ciclo, meses, preco_mensal, asaas_cycle)
SELECT p.id, c.ciclo, c.meses, c.preco, c.asaas
  FROM planos p
  JOIN (VALUES
    ('Starter',      'mensal',      1,  79.00, 'MONTHLY'),
    ('Starter',      'trimestral',  3,  72.00, 'QUARTERLY'),
    ('Starter',      'semestral',   6,  69.00, 'SEMIANNUALLY'),
    ('Starter',      'anual',      12,  59.00, 'YEARLY'),
    ('Profissional', 'mensal',      1, 219.00, 'MONTHLY'),
    ('Profissional', 'trimestral',  3, 199.00, 'QUARTERLY'),
    ('Profissional', 'semestral',   6, 189.00, 'SEMIANNUALLY'),
    ('Profissional', 'anual',      12, 169.00, 'YEARLY'),
    ('Enterprise',   'mensal',      1, 397.00, 'MONTHLY'),
    ('Enterprise',   'trimestral',  3, 359.00, 'QUARTERLY'),
    ('Enterprise',   'semestral',   6, 339.00, 'SEMIANNUALLY'),
    ('Enterprise',   'anual',      12, 299.00, 'YEARLY')
  ) AS c(plano_nome, ciclo, meses, preco, asaas) ON c.plano_nome = p.nome
ON CONFLICT (plano_id, ciclo) DO UPDATE
  SET meses = EXCLUDED.meses,
      preco_mensal = EXCLUDED.preco_mensal,
      asaas_cycle = EXCLUDED.asaas_cycle,
      ativo = true;

-- ── ciclo escolhido pela empresa ─────────────────────────────────────────────
ALTER TABLE assinaturas
  ADD COLUMN IF NOT EXISTS ciclo varchar(20) NOT NULL DEFAULT 'mensal';

COMMENT ON COLUMN assinaturas.ciclo IS 'Compromisso contratado; casa com planos_ciclos.ciclo';

-- ── cortesia ANTES de baixar a base ──────────────────────────────────────────
-- A ordem importa: depois do UPDATE em planos não há mais como saber qual era a
-- base antiga. Só quem tem relação paga de verdade — trial nunca pagou nada e
-- cancelado já saiu, então os dois entram nas regras novas.
UPDATE assinaturas a
   SET usuarios_cortesia = a.usuarios_cortesia + (p.usuarios_base - novo.base),
       updated_at        = now()
  FROM planos p
  JOIN (VALUES ('Profissional', 2), ('Enterprise', 4)) AS novo(nome, base) ON novo.nome = p.nome
 WHERE a.plano_id = p.id
   AND a.status IN ('ativa', 'aguardando_pagamento', 'suspensa')
   AND p.usuarios_base > novo.base;

-- ── nova base ────────────────────────────────────────────────────────────────
UPDATE planos SET usuarios_base = 2, max_usuarios = 2 WHERE nome = 'Profissional';
UPDATE planos SET usuarios_base = 4, max_usuarios = 4 WHERE nome = 'Enterprise';

-- O texto do card ainda prometia a base antiga.
UPDATE planos
   SET features = REPLACE(features::text, '4 usuários inclusos', '2 usuários inclusos')::jsonb
 WHERE nome = 'Profissional';

UPDATE planos
   SET features = REPLACE(features::text, '6 usuários inclusos', '4 usuários inclusos')::jsonb
 WHERE nome = 'Enterprise';

COMMIT;
