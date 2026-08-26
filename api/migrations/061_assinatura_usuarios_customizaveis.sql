-- Assinatura com quantidade de usuários customizável (a partir do Profissional).
--
-- Regra: cada conta de usuário tem sua própria instância de WhatsApp, então
-- "usuários" e "integrações WhatsApp" são a mesma contagem. O total inclui o
-- master da empresa.
--
--   Profissional  base 4 (1 master + 3 comuns)  teto 10  → até  6 adicionais
--   Enterprise    base 6 (1 master + 5 comuns)  teto 30  → até 24 adicionais
--   Starter       fixo em 2, sem customização
--
-- Adicional: R$ 100,00 por usuário/mês.

BEGIN;

-- ── planos ───────────────────────────────────────────────────────────────────
ALTER TABLE planos
  ADD COLUMN IF NOT EXISTS usuarios_base            integer,
  ADD COLUMN IF NOT EXISTS usuarios_max             integer,
  ADD COLUMN IF NOT EXISTS preco_usuario_adicional  numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customizavel             boolean       NOT NULL DEFAULT false;

COMMENT ON COLUMN planos.usuarios_base           IS 'Usuários inclusos no preço base (conta o master)';
COMMENT ON COLUMN planos.usuarios_max            IS 'Teto de usuários que o plano aceita, mesmo comprando adicionais';
COMMENT ON COLUMN planos.preco_usuario_adicional IS 'Preço mensal de cada usuário acima da base';
COMMENT ON COLUMN planos.customizavel            IS 'Se o cliente pode comprar usuários adicionais';

-- Starter: continua fixo. max_usuarios preservado como estava.
UPDATE planos SET usuarios_base = 2, usuarios_max = 2,
                  preco_usuario_adicional = 0, customizavel = false
 WHERE nome = 'Starter';

UPDATE planos SET usuarios_base = 4, usuarios_max = 10,
                  preco_usuario_adicional = 100.00, customizavel = true
 WHERE nome = 'Profissional';

UPDATE planos SET usuarios_base = 6, usuarios_max = 30,
                  preco_usuario_adicional = 100.00, customizavel = true
 WHERE nome = 'Enterprise';

-- max_usuarios vira espelho da base (a fonte de verdade do limite de cada
-- empresa passa a ser assinaturas.usuarios_contratados).
UPDATE planos SET max_usuarios = usuarios_base WHERE usuarios_base IS NOT NULL;

-- ── assinaturas ──────────────────────────────────────────────────────────────
-- Quantos usuários ESTA empresa contratou. NULL = ainda não definido, cai na
-- base do plano.
ALTER TABLE assinaturas
  ADD COLUMN IF NOT EXISTS usuarios_contratados integer,
  ADD COLUMN IF NOT EXISTS usuarios_cortesia    integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN assinaturas.usuarios_contratados IS 'Total de usuários contratado pela empresa (inclui o master)';
COMMENT ON COLUMN assinaturas.usuarios_cortesia    IS 'Usuários acima da base concedidos sem cobrança (clientes anteriores ao modelo customizável)';

-- Clientes atuais não podem perder usuários nem receber cobrança retroativa:
-- o que já usam vira contratado, e o excedente sobre a base nova vira cortesia.
WITH uso AS (
  SELECT a.empresa_id,
         p.usuarios_base,
         GREATEST(
           COALESCE(p.usuarios_base, 0),
           (SELECT COUNT(*) FROM usuarios u WHERE u.empresa_id = a.empresa_id AND u.ativo)
         )::int AS total_atual
    FROM assinaturas a
    JOIN planos p ON p.id = a.plano_id
   WHERE a.usuarios_contratados IS NULL
)
UPDATE assinaturas a
   SET usuarios_contratados = uso.total_atual,
       usuarios_cortesia    = GREATEST(0, uso.total_atual - COALESCE(uso.usuarios_base, 0)),
       updated_at           = now()
  FROM uso
 WHERE a.empresa_id = uso.empresa_id;

COMMIT;
