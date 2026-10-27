-- 110 (21/10/2026): o Duo (chat) passa a executar ações no sistema — consultar, inserir e
-- editar; nunca excluir. Decisão do dono: só o que a pessoa já pode fazer nas telas, em
-- todos os planos, sempre pela chave da DuoFuturo, com crédito de teste e depois crédito
-- comprado na plataforma.
--
--   duo_acoes          → toda ação que grava: proposta (pendente), confirmada pela pessoa
--                        numa mensagem SEGUINTE, executada — com o antes e o depois.
--   duo_creditos_mov   → extrato de crédito por empresa (teste, compra, consumo, ajuste).
--                        Saldo = soma de valor_brl. Consumo entra negativo.
--
-- Rodar como postgres, com os GRANT para a API:
--   sudo -u postgres psql -d gestao_financeira -v ON_ERROR_STOP=1 -f migrations/110_duo_agente_acoes.sql
CREATE TABLE IF NOT EXISTS duo_acoes (
  id            serial PRIMARY KEY,
  empresa_id    integer NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id    integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  acao          varchar(60) NOT NULL,
  entrada       jsonb NOT NULL DEFAULT '{}'::jsonb,
  resumo        text NOT NULL,
  antes         jsonb,
  depois        jsonb,
  status        varchar(20) NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'executada', 'cancelada', 'erro', 'expirada')),
  erro          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  executada_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_duo_acoes_usuario ON duo_acoes (usuario_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_duo_acoes_empresa ON duo_acoes (empresa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS duo_creditos_mov (
  id          serial PRIMARY KEY,
  empresa_id  integer NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id  integer REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo        varchar(20) NOT NULL CHECK (tipo IN ('teste', 'compra', 'consumo', 'ajuste')),
  valor_brl   numeric(12, 4) NOT NULL,
  detalhe     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_duo_creditos_empresa ON duo_creditos_mov (empresa_id, created_at DESC);
-- Uma única carga de teste por empresa, mesmo com 3 instâncias da API correndo juntas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_duo_creditos_teste ON duo_creditos_mov (empresa_id) WHERE tipo = 'teste';

GRANT SELECT, INSERT, UPDATE ON duo_acoes, duo_creditos_mov TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE duo_acoes_id_seq, duo_creditos_mov_id_seq TO gestao_user;
