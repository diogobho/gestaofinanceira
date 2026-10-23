-- 091 — Botão de link nas mensagens de grupo (30/09/2026)
--
-- Uma linha por mensagem que leva botão (texto + link). Tabela à parte porque
-- `grupos_mensagens` é do postgres e o gestao_user não pode alterá-la; sem FK pelo
-- mesmo motivo (sem REFERENCES) — a exclusão da mensagem apaga a linha pelo serviço.
-- Roda como o usuário da API, e o serviço também a cria sozinho (`garantirTabelaBotao`).

CREATE TABLE IF NOT EXISTS grupos_mensagens_botao (
  mensagem_id INTEGER PRIMARY KEY,
  texto       VARCHAR(25)  NOT NULL,
  url         VARCHAR(500) NOT NULL
);
