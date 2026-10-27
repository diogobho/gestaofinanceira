-- 094 — Respostas por botão (01/10/2026)
--
-- No estágio X, se o lead de origem Y clicar no botão Z (modelo da Meta com resposta
-- rápida), envia uma sequência de mensagens (texto, áudio, vídeo, imagem, documento) pelo
-- número do responsável e cria uma tarefa de FUP para N dias. Só o clique dispara.
-- Tabelas do gestao_user (estagios_funil é do postgres); o serviço também as cria sozinho.

CREATE TABLE IF NOT EXISTS respostas_botao (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER     NOT NULL,
  estagio_id  INTEGER     NOT NULL,
  origem      VARCHAR(50),
  botao       VARCHAR(60) NOT NULL,
  passos      JSONB       NOT NULL DEFAULT '[]',
  tarefa_dias INTEGER,
  ativa       BOOLEAN     NOT NULL DEFAULT true,
  ordem       INTEGER     NOT NULL DEFAULT 0,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_respostas_botao_estagio ON respostas_botao (estagio_id);

-- Uma regra vale uma vez por lead: clicar de novo não reenvia a sequência.
CREATE TABLE IF NOT EXISTS respostas_botao_aplicadas (
  regra_id    INTEGER     NOT NULL,
  lead_id     INTEGER     NOT NULL,
  aplicado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (regra_id, lead_id)
);
