-- 066 — Conta Azul: várias contas por empresa (consolidação por produto)
--
-- Até a 062 era UMA conta do Conta Azul por empresa: `contaazul_tokens` tinha
-- UNIQUE(empresa_id) e o client_id/client_secret vinham do api/.env, ou seja,
-- global para o processo inteiro. A Panteras passou a ter duas contas (dois
-- produtos), e o dashboard precisa somar as duas podendo filtrar cada uma.
--
-- Por isso as credenciais saem do .env e passam a ser POR CONEXÃO: cada app do
-- Conta Azul tem seu próprio par client_id/client_secret, e o refresh_token só
-- vale para o client que o emitiu. O .env mantém apenas o que é comum às duas:
-- CONTAAZUL_REDIRECT_URI, CONTAAZUL_SETUP_SECRET e CONTAAZUL_EMPRESA_ID.
--
-- O `nome` é o rótulo que aparece no filtro do dashboard — editável no banco,
-- sem deploy.

CREATE TABLE IF NOT EXISTS contaazul_conexoes (
    id            SERIAL PRIMARY KEY,
    empresa_id    INTEGER      NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome          VARCHAR(60)  NOT NULL,               -- rótulo no dashboard
    client_id     VARCHAR(120) NOT NULL,
    client_secret TEXT         NOT NULL,
    ativo         BOOLEAN      NOT NULL DEFAULT TRUE,  -- false = para de puxar, sem perder o token
    ordem         SMALLINT     NOT NULL DEFAULT 0,     -- ordem de exibição
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contaazul_conexoes_empresa_nome
    ON contaazul_conexoes (empresa_id, nome);
-- Um client_id do Conta Azul não pode estar em duas conexões: o refresh_token
-- é emitido por client, e duplicar levaria uma conexão a sobrescrever a outra.
CREATE UNIQUE INDEX IF NOT EXISTS contaazul_conexoes_client_id
    ON contaazul_conexoes (client_id);

-- ── tokens: passam a pertencer a uma conexão ─────────────────────────────────
ALTER TABLE contaazul_tokens
    ADD COLUMN IF NOT EXISTS conexao_id INTEGER REFERENCES contaazul_conexoes(id) ON DELETE CASCADE;

ALTER TABLE contaazul_tokens DROP CONSTRAINT IF EXISTS contaazul_tokens_empresa_unica;

CREATE UNIQUE INDEX IF NOT EXISTS contaazul_tokens_conexao_unica
    ON contaazul_tokens (conexao_id);

CREATE INDEX IF NOT EXISTS idx_contaazul_tokens_empresa
    ON contaazul_tokens (empresa_id);

-- ── states do OAuth: o callback precisa saber para QUAL conexão gravar ───────
ALTER TABLE contaazul_oauth_states
    ADD COLUMN IF NOT EXISTS conexao_id INTEGER REFERENCES contaazul_conexoes(id) ON DELETE CASCADE;

COMMENT ON TABLE  contaazul_conexoes IS
    'Uma linha por app/conta do Conta Azul. Credenciais por conexão porque o refresh_token só vale para o client que o emitiu.';
COMMENT ON COLUMN contaazul_conexoes.nome IS
    'Rótulo do produto no dashboard (ex.: Panteras, Escola de Empreendedorismo).';
COMMENT ON COLUMN contaazul_tokens.conexao_id IS
    'Conexão dona deste par de tokens. NULL só existe em base pré-066 ainda não semeada.';

-- Rodar como postgres (dono das tabelas). O usuário da aplicação precisa do grant:
GRANT SELECT, INSERT, UPDATE, DELETE ON contaazul_conexoes TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE contaazul_conexoes_id_seq TO gestao_user;
