-- 112 (23/10/2026): conector MCP — usar o Duo de dentro do Claude da própria pessoa.
--
-- O Claude (claude.ai, Desktop, Code) conecta em https://duofuturo.tech/api/gestao/mcp e
-- faz login pelo OAuth 2.1 deste servidor: registro dinâmico do cliente, tela de login
-- do Duo com PKCE, e token opaco ligado ao USUÁRIO. As ferramentas são as mesmas do chat
-- do Duo (acoes.ts), com o mesmo escopo, permissões e confirmação antes de gravar.
--
-- Os tokens são guardados só como hash (sha256): vazar a tabela não entrega acesso.
--
-- Rodar como postgres, com os GRANT para a API:
--   sudo -u postgres psql -d gestao_financeira -v ON_ERROR_STOP=1 -f migrations/112_mcp_oauth.sql
CREATE TABLE IF NOT EXISTS mcp_oauth_clientes (
  client_id      varchar(64) PRIMARY KEY,
  nome           varchar(200),
  redirect_uris  jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_oauth_codigos (
  codigo_hash     char(64) PRIMARY KEY,
  client_id       varchar(64) NOT NULL REFERENCES mcp_oauth_clientes(client_id) ON DELETE CASCADE,
  usuario_id      integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  redirect_uri    text NOT NULL,
  code_challenge  varchar(128) NOT NULL,
  expira_em       timestamptz NOT NULL,
  usado_em        timestamptz
);

CREATE TABLE IF NOT EXISTS mcp_oauth_tokens (
  id                 serial PRIMARY KEY,
  access_hash        char(64) NOT NULL UNIQUE,
  refresh_hash       char(64) NOT NULL UNIQUE,
  client_id          varchar(64) NOT NULL REFERENCES mcp_oauth_clientes(client_id) ON DELETE CASCADE,
  usuario_id         integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  empresa_id         integer NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  access_expira_em   timestamptz NOT NULL,
  refresh_expira_em  timestamptz NOT NULL,
  revogado_em        timestamptz,
  ultimo_uso_em      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_usuario ON mcp_oauth_tokens (usuario_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON mcp_oauth_clientes, mcp_oauth_codigos, mcp_oauth_tokens TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE mcp_oauth_tokens_id_seq TO gestao_user;
