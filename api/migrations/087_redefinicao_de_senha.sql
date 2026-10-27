-- 087 — Esqueci minha senha (28/09/2026)
--
-- Até aqui não existia caminho nenhum: quem esquecia a senha dependia de alguém
-- da equipe trocar à mão. Agora o login tem "Esqueci minha senha", que manda um
-- link de uso único pelo remetente institucional (o SMTP da conta DuoFuturo).
--
-- O banco guarda só o SHA-256 do token, nunca o token: quem lê a tabela (backup,
-- dump, consulta de suporte) não consegue trocar a senha de ninguém. O token em
-- si só existe no e-mail.
--
-- `usado_em` é o que garante uso único com 3 instâncias no cluster: a troca é um
-- `UPDATE ... WHERE usado_em IS NULL RETURNING`, então de dois cliques no mesmo
-- link um vence e o outro vê zero linhas.
--
-- Roda como postgres (dono de `usuarios`), com o GRANT para a API.

CREATE TABLE IF NOT EXISTS senha_redefinicoes (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  ip          VARCHAR(64),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Limite de pedidos por usuário e por IP olha a última hora.
CREATE INDEX IF NOT EXISTS idx_senha_redefinicoes_usuario ON senha_redefinicoes (usuario_id, criado_em);
CREATE INDEX IF NOT EXISTS idx_senha_redefinicoes_ip ON senha_redefinicoes (ip, criado_em);

GRANT SELECT, INSERT, UPDATE, DELETE ON senha_redefinicoes TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE senha_redefinicoes_id_seq TO gestao_user;
