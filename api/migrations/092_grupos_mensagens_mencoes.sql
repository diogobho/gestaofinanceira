-- 092 — Pessoas marcadas com @ nas mensagens de grupo (30/09/2026)
--
-- Uma linha por mensagem que marca alguém: [{id, numero, rotulo}] (ver
-- `modules/grupos/mencoes.ts`). À parte pelo mesmo motivo da 091: `grupos_mensagens`
-- é do postgres. Roda como o usuário da API, e o serviço também cria sozinho.

CREATE TABLE IF NOT EXISTS grupos_mensagens_mencoes (
  mensagem_id INTEGER PRIMARY KEY,
  mencoes     JSONB NOT NULL
);

-- O mesmo para a boas-vindas (`automacoes_grupo` também é do postgres).
CREATE TABLE IF NOT EXISTS grupos_boas_vindas_mencoes (
  automacao_id INTEGER PRIMARY KEY,
  mencoes      JSONB NOT NULL
);
