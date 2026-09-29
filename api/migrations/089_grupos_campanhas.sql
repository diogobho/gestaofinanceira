-- 089 — Campanhas de grupo do WhatsApp (28/09/2026)
--
-- O que o SendFlow faz e a página de Grupos (088) ainda não fazia: um LINK ÚNICO de
-- campanha que manda cada pessoa para o grupo com vaga e abre o próximo quando ele
-- enche; o painel de quem clicou, entrou e saiu; mensagens para todos os grupos da
-- campanha de uma vez; e — o que o SendFlow não tem — quem entra vira lead no funil.
--
-- Só pelo QR Code (Baileys), como toda a página de Grupos. Capacidade nova
-- `grupos_campanhas`, só do Enterprise: o básico (mensagem e boas-vindas) segue no
-- Profissional.
--
-- Roda como postgres (dono de `planos` e de `grupos_mensagens`), com os GRANT para a API.

CREATE TABLE IF NOT EXISTS grupos_campanhas (
  id                 SERIAL PRIMARY KEY,
  empresa_id         INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  criado_por         INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  nome               VARCHAR(120) NOT NULL,
  slug               VARCHAR(60) NOT NULL UNIQUE,              -- duofuturo.tech/gestao/g/<slug>
  limite_por_grupo   INTEGER NOT NULL DEFAULT 900 CHECK (limite_por_grupo BETWEEN 5 AND 1024),
  chips              INTEGER[] NOT NULL DEFAULT '{}',           -- usuários cujos chips criam os grupos novos
  criar_grupos       BOOLEAN NOT NULL DEFAULT true,             -- abre grupo novo quando todos enchem
  nome_grupo_modelo  VARCHAR(100) NOT NULL,                     -- "Turma {{n}}"
  descricao_grupo    TEXT,
  so_admins_enviam   BOOLEAN NOT NULL DEFAULT true,
  criar_lead         BOOLEAN NOT NULL DEFAULT false,
  funil_id           INTEGER REFERENCES funis(id) ON DELETE SET NULL,
  estagio_id         INTEGER REFERENCES estagios_funil(id) ON DELETE SET NULL,
  responsavel_id     INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  origem             VARCHAR(50),
  ativa              BOOLEAN NOT NULL DEFAULT true,
  -- Trava de "criando grupo agora" (3 processos no cluster). Vence sozinha em 2 min.
  criando_grupo_em   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grupos_campanhas_empresa ON grupos_campanhas (empresa_id);

CREATE TABLE IF NOT EXISTS grupos_campanhas_grupos (
  id                     SERIAL PRIMARY KEY,
  campanha_id            INTEGER NOT NULL REFERENCES grupos_campanhas(id) ON DELETE CASCADE,
  empresa_id             INTEGER NOT NULL,
  usuario_id             INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,  -- chip admin do grupo
  grupo_id               VARCHAR(100) NOT NULL,
  nome                   VARCHAR(255),
  convite                VARCHAR(100),                           -- código de chat.whatsapp.com/<código>
  participantes          INTEGER NOT NULL DEFAULT 0,
  participantes_em       TIMESTAMPTZ,
  ordem                  INTEGER NOT NULL DEFAULT 0,
  cheio                  BOOLEAN NOT NULL DEFAULT false,
  ativo                  BOOLEAN NOT NULL DEFAULT true,          -- fora da rotação do link (e das mensagens) quando false
  criado_pela_campanha   BOOLEAN NOT NULL DEFAULT false,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, grupo_id)
);
CREATE INDEX IF NOT EXISTS idx_campanhas_grupos_grupo ON grupos_campanhas_grupos (empresa_id, grupo_id);

-- Clique no link. Não identifica a pessoa (o WhatsApp não devolve quem clicou): serve
-- para contar e para saber de qual utm veio o tráfego.
CREATE TABLE IF NOT EXISTS grupos_campanhas_cliques (
  id            BIGSERIAL PRIMARY KEY,
  campanha_id   INTEGER NOT NULL REFERENCES grupos_campanhas(id) ON DELETE CASCADE,
  grupo_id      VARCHAR(100),                                   -- para onde foi mandado (NULL = sem vaga)
  utm_source    VARCHAR(100),
  utm_medium    VARCHAR(100),
  utm_campaign  VARCHAR(100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campanhas_cliques ON grupos_campanhas_cliques (campanha_id, created_at);

CREATE TABLE IF NOT EXISTS grupos_campanhas_eventos (
  id                BIGSERIAL PRIMARY KEY,
  campanha_id       INTEGER NOT NULL REFERENCES grupos_campanhas(id) ON DELETE CASCADE,
  empresa_id        INTEGER NOT NULL,
  grupo_id          VARCHAR(100) NOT NULL,
  participante_jid  VARCHAR(100) NOT NULL,
  numero            VARCHAR(20),
  nome              VARCHAR(255),
  tipo              VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  lead_id           INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campanhas_eventos ON grupos_campanhas_eventos (campanha_id, created_at);

-- Mensagem da campanha: vai para TODOS os grupos ativos dela na hora do envio (inclusive
-- os que abriram depois de a mensagem ser criada), cada um pelo chip que o administra.
ALTER TABLE grupos_mensagens ADD COLUMN IF NOT EXISTS campanha_id INTEGER REFERENCES grupos_campanhas(id) ON DELETE CASCADE;

-- ── Enterprise ganha `grupos_campanhas` ─────────────────────────────────────
UPDATE planos SET capacidades = '[
  "financeiro", "relatorios", "duo_chat",
  "crm", "whatsapp_qr", "agente_reativo", "followup_morno",
  "disparo_email", "grupos_whatsapp",
  "whatsapp_oficial", "disparo_whatsapp", "conversa_fria",
  "agente_proativo", "modelos_meta", "smtp_proprio",
  "grupos_campanhas"
]'::jsonb WHERE id = 3;

GRANT SELECT, INSERT, UPDATE, DELETE ON grupos_campanhas, grupos_campanhas_grupos, grupos_campanhas_cliques, grupos_campanhas_eventos TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE grupos_campanhas_id_seq, grupos_campanhas_grupos_id_seq, grupos_campanhas_cliques_id_seq, grupos_campanhas_eventos_id_seq TO gestao_user;
