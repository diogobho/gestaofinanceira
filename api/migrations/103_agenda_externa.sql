-- 103: agenda externa (06/10/2026). Reunião do CRM (tarefas_lead tipo 'reuniao') vira evento
-- no Google Agenda (com Meet) ou no calendário Microsoft 365/Outlook (com Teams) de quem é o
-- responsável. Só ida: o Duo manda; o que se cria direto lá não volta.
-- Sem FK para usuarios/tarefas_lead: o usuário da app não tem REFERENCES nelas (donas: postgres).
CREATE TABLE IF NOT EXISTS agenda_contas (
  usuario_id       INTEGER PRIMARY KEY,                 -- uma agenda conectada por usuário
  empresa_id       INTEGER NOT NULL,
  provedor         VARCHAR(10) NOT NULL CHECK (provedor IN ('google', 'microsoft')),
  email            VARCHAR(255),
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT,
  expira_em        TIMESTAMPTZ NOT NULL,
  erro             TEXT,                                -- ex.: acesso revogado; a tela pede reconectar
  conectado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agenda_eventos (
  tarefa_id      INTEGER PRIMARY KEY,
  empresa_id     INTEGER NOT NULL,
  usuario_id     INTEGER NOT NULL,                     -- dono da agenda onde o evento está
  provedor       VARCHAR(10) NOT NULL,
  evento_id      TEXT NOT NULL,
  link_reuniao   TEXT,                                 -- Meet ou Teams
  link_evento    TEXT,
  assinatura     TEXT,                                 -- hash do que foi enviado: igual = nada a fazer
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  erro           TEXT
);
CREATE INDEX IF NOT EXISTS agenda_eventos_usuario ON agenda_eventos (usuario_id);
