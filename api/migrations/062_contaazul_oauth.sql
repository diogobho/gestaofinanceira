-- 062 — Conta Azul: armazenamento dos tokens OAuth2
--
-- O access_token do Conta Azul dura 60 minutos; o valor durável é o refresh_token.
-- Guardamos os dois aqui para o backend renovar sozinho, sem intervenção manual.
--
-- Uma linha por empresa (multi-tenant). O client_secret NÃO fica aqui — ele mora
-- no api/.env, junto das demais credenciais de integração.

CREATE TABLE IF NOT EXISTS contaazul_tokens (
    id                SERIAL PRIMARY KEY,
    empresa_id        INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    access_token      TEXT        NOT NULL,
    refresh_token     TEXT        NOT NULL,
    token_type        VARCHAR(40),
    scope             TEXT,
    expira_em         TIMESTAMPTZ NOT NULL,           -- quando o access_token morre
    ultima_renovacao  TIMESTAMPTZ,
    renovacao_falhas  INTEGER     NOT NULL DEFAULT 0, -- p/ parar de insistir em token revogado
    ultimo_erro       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT contaazul_tokens_empresa_unica UNIQUE (empresa_id)
);

CREATE INDEX IF NOT EXISTS idx_contaazul_tokens_expira ON contaazul_tokens (expira_em);

COMMENT ON TABLE  contaazul_tokens IS 'Tokens OAuth2 do Conta Azul, por empresa. refresh_token é o que importa.';
COMMENT ON COLUMN contaazul_tokens.expira_em IS 'Expiração do access_token (~60 min). Renovar antes disso.';
COMMENT ON COLUMN contaazul_tokens.renovacao_falhas IS 'Falhas seguidas de refresh; ao estourar, exige novo consentimento.';

-- Estados pendentes do fluxo de autorização (proteção contra CSRF no callback).
-- Registro de vida curta: criado no /authorize, consumido no /callback.
CREATE TABLE IF NOT EXISTS contaazul_oauth_states (
    state       VARCHAR(64) PRIMARY KEY,
    empresa_id  INTEGER     NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id  INTEGER     REFERENCES usuarios(id) ON DELETE SET NULL,
    expira_em   TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contaazul_states_expira ON contaazul_oauth_states (expira_em);

COMMENT ON TABLE contaazul_oauth_states IS 'State do OAuth2 do Conta Azul: uso único, expira em minutos.';
