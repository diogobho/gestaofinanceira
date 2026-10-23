-- 109 (14/10/2026): abrir e fechar grupo por horário — chamado #420 da Panteras. No SendFlow
-- a equipe fecha os grupos no sábado às 18h e abre na segunda às 9h; aqui é a mesma regra.
-- Fechar = "só admins enviam" (`announcement`); abrir = todos enviam. Sai pelo chip de quem
-- criou a regra, que precisa ser admin do grupo. Dias e hora em Brasília, como as mensagens.
-- Rodar como postgres (dono de `empresas`/`usuarios`), com os GRANT para a API:
--   sudo -u postgres psql -d gestao_financeira -v ON_ERROR_STOP=1 -f migrations/109_grupos_horario.sql
CREATE TABLE IF NOT EXISTS grupos_horario (
  id               serial PRIMARY KEY,
  empresa_id       integer NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id       integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo           varchar(200) NOT NULL,
  grupos           jsonb NOT NULL DEFAULT '[]'::jsonb,
  fechar_dias      integer[] NOT NULL,
  fechar_hora      varchar(5) NOT NULL,
  abrir_dias       integer[] NOT NULL,
  abrir_hora       varchar(5) NOT NULL,
  ativa            boolean NOT NULL DEFAULT true,
  proximo_fechar   timestamptz,
  proximo_abrir    timestamptz,
  ultima_execucao  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grupos_horario_empresa ON grupos_horario (empresa_id);

CREATE TABLE IF NOT EXISTS grupos_horario_execucoes (
  id           serial PRIMARY KEY,
  regra_id     integer NOT NULL REFERENCES grupos_horario(id) ON DELETE CASCADE,
  empresa_id   integer NOT NULL,
  grupo_id     varchar(100) NOT NULL,
  grupo_nome   varchar(255),
  acao         varchar(6) NOT NULL CHECK (acao IN ('fechar', 'abrir')),
  status       varchar(10) NOT NULL CHECK (status IN ('feito', 'falhou')),
  erro         text,
  executado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grupos_horario_exec ON grupos_horario_execucoes (regra_id, executado_em DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON grupos_horario, grupos_horario_execucoes TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE grupos_horario_id_seq, grupos_horario_execucoes_id_seq TO gestao_user;
