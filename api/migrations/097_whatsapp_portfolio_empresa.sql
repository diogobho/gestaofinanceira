-- 097 — Um portfólio da Meta por EMPRESA (02/10/2026).
--
-- Cada operador que passava pela janela do Embedded Signup escolhia (ou criava) um
-- portfólio — a Panteras terminou com dois, nenhum com o nome dela, e o da Jéssica sem
-- cartão: as conversas iniciadas pela empresa ficam bloqueadas até alguém cadastrar.
--
-- A referência nasce na PRIMEIRA conexão, que é do dono da conta (creator): o portfólio,
-- a conta do WhatsApp (WABA) e o token dela. Dali em diante:
--   - número novo da equipe é criado direto nessa WABA pela API (código por SMS), sem
--     janela da Meta e sem login no Facebook — e o cartão é um só;
--   - número que vem do app (coexistência) ainda passa pela janela, e precisa cair no
--     MESMO portfólio — outro é recusado antes de registrar.
-- Rodar como postgres.

CREATE TABLE IF NOT EXISTS whatsapp_portfolio_empresa (
  empresa_id    INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  business_id   VARCHAR(40)  NOT NULL,
  business_nome VARCHAR(200),
  waba_id       VARCHAR(40)  NOT NULL,
  token_enc     TEXT         NOT NULL,
  definido_por  INTEGER      REFERENCES usuarios(id) ON DELETE SET NULL,
  definido_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_portfolio_empresa TO gestao_user;
