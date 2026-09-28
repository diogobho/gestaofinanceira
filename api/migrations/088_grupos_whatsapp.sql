-- 088 — Página de Grupos do WhatsApp (28/09/2026)
--
-- Mensagem para grupo (na hora, agendada ou recorrente, com mídia e "marcar todos")
-- e boas-vindas a quem entra. Só pelo QR Code: a Groups API da Meta exige Conta
-- Comercial Oficial (selo verde) e para em 8 participantes — nenhum número nosso
-- tem o selo, e a tela diz isso a quem está no oficial.
--
-- As boas-vindas (`automacoes_grupo`) existiam sem tela e nunca funcionaram: a
-- instância não avisava a API quando alguém entrava, e o envio chamava um
-- `/send-message` que não existe. A fila abaixo substitui o `setTimeout` (perdido a
-- cada restart) e deixa agrupar: 30 pessoas entrando pelo link viram UMA mensagem
-- no grupo marcando as 30, não 30 mensagens.
--
-- Roda como postgres (dono de `automacoes_grupo`), com os GRANT para a API.

CREATE TABLE IF NOT EXISTS grupos_mensagens (
  id                  SERIAL PRIMARY KEY,
  empresa_id          INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id          INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,  -- chip que envia
  titulo              VARCHAR(200) NOT NULL,
  texto               TEXT NOT NULL DEFAULT '',
  media_url           TEXT,
  media_mimetype      VARCHAR(120),
  media_filename      VARCHAR(255),
  mencionar_todos     BOOLEAN NOT NULL DEFAULT false,
  grupos              JSONB NOT NULL DEFAULT '[]',          -- [{id, nome}]
  modo                VARCHAR(12) NOT NULL CHECK (modo IN ('agora', 'agendada', 'recorrente')),
  agendado_para       TIMESTAMPTZ,
  recorrencia         JSONB,                                -- {dias: [0..6], hora: 'HH:MM'} em Brasília
  proxima_execucao    TIMESTAMPTZ,                          -- NULL = nada a enviar
  ativa               BOOLEAN NOT NULL DEFAULT true,
  intervalo_segundos  INTEGER NOT NULL DEFAULT 20 CHECK (intervalo_segundos BETWEEN 5 AND 600),
  ultima_execucao     TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grupos_mensagens_empresa ON grupos_mensagens (empresa_id);
CREATE INDEX IF NOT EXISTS idx_grupos_mensagens_proxima ON grupos_mensagens (proxima_execucao) WHERE ativa;

CREATE TABLE IF NOT EXISTS grupos_mensagens_envios (
  id                   SERIAL PRIMARY KEY,
  mensagem_id          INTEGER NOT NULL REFERENCES grupos_mensagens(id) ON DELETE CASCADE,
  empresa_id           INTEGER NOT NULL,
  grupo_id             VARCHAR(100) NOT NULL,
  grupo_nome           VARCHAR(255),
  execucao_em          TIMESTAMPTZ NOT NULL,                 -- agrupa os envios de uma rodada
  status               VARCHAR(10) NOT NULL CHECK (status IN ('enviado', 'falhou')),
  erro                 TEXT,
  whatsapp_message_id  VARCHAR(100),
  enviado_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grupos_envios_mensagem ON grupos_mensagens_envios (mensagem_id, execucao_em DESC);

ALTER TABLE automacoes_grupo ADD COLUMN IF NOT EXISTS mencionar BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS grupos_boas_vindas_fila (
  id                 SERIAL PRIMARY KEY,
  automacao_id       INTEGER NOT NULL REFERENCES automacoes_grupo(id) ON DELETE CASCADE,
  empresa_id         INTEGER NOT NULL,
  grupo_id           VARCHAR(100) NOT NULL,
  participante_jid   VARCHAR(100) NOT NULL,
  participante_nome  VARCHAR(255),
  enviar_em          TIMESTAMPTZ NOT NULL,
  status             VARCHAR(10) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falhou')),
  erro               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  processado_em      TIMESTAMPTZ
);
-- A instância pode repetir o evento: a mesma pessoa não entra duas vezes na fila.
CREATE UNIQUE INDEX IF NOT EXISTS uq_boas_vindas_pendente
  ON grupos_boas_vindas_fila (automacao_id, participante_jid) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_boas_vindas_enviar ON grupos_boas_vindas_fila (enviar_em) WHERE status = 'pendente';

GRANT SELECT, INSERT, UPDATE, DELETE ON grupos_mensagens, grupos_mensagens_envios, grupos_boas_vindas_fila, automacoes_grupo TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE grupos_mensagens_id_seq, grupos_mensagens_envios_id_seq, grupos_boas_vindas_fila_id_seq TO gestao_user;
