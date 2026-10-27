-- 111 (23/10/2026): Duo 2.0 — compra de crédito pela plataforma e link de afiliado.
--
--   duo_creditos_compras → cobrança avulsa no Asaas para recarregar o crédito do Duo.
--                          O crédito só entra em duo_creditos_mov quando o webhook
--                          confirma E o pagamento é conferido na API do Asaas.
--   afiliados            → um código por empresa (o link fica preso à conta de quem
--                          indica). Só conta ativa (paga) gera link.
--   empresas.indicada_por_empresa_id → quem indicou, gravado no cadastro (?ref=).
--   afiliado_comissoes   → 20% do PRIMEIRO pagamento da indicada, uma vez só
--                          (unique por indicada). Pagamento da comissão é manual.
--
-- Rodar como postgres, com os GRANT para a API:
--   sudo -u postgres psql -d gestao_financeira -v ON_ERROR_STOP=1 -f migrations/111_duo_creditos_compra_afiliados.sql
CREATE TABLE IF NOT EXISTS duo_creditos_compras (
  id                serial PRIMARY KEY,
  empresa_id        integer NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id        integer REFERENCES usuarios(id) ON DELETE SET NULL,
  valor_brl         numeric(12, 2) NOT NULL CHECK (valor_brl > 0),
  asaas_payment_id  varchar(60) UNIQUE,
  invoice_url       text,
  status            varchar(20) NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'paga', 'cancelada')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  paga_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_duo_compras_empresa ON duo_creditos_compras (empresa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS afiliados (
  empresa_id  integer PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  codigo      varchar(20) NOT NULL UNIQUE,
  usuario_id  integer REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS indicada_por_empresa_id integer REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS indicada_codigo varchar(20);

CREATE TABLE IF NOT EXISTS afiliado_comissoes (
  id                   serial PRIMARY KEY,
  afiliado_empresa_id  integer NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  indicada_empresa_id  integer NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
  asaas_payment_id     varchar(60),
  valor_pagamento      numeric(12, 2) NOT NULL,
  percentual           numeric(5, 2) NOT NULL,
  valor_comissao       numeric(12, 2) NOT NULL,
  status               varchar(20) NOT NULL DEFAULT 'a_pagar'
                       CHECK (status IN ('a_pagar', 'paga', 'cancelada')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  paga_at              timestamptz
);
CREATE INDEX IF NOT EXISTS idx_comissoes_afiliado ON afiliado_comissoes (afiliado_empresa_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON duo_creditos_compras, afiliados, afiliado_comissoes TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE duo_creditos_compras_id_seq, afiliado_comissoes_id_seq TO gestao_user;
