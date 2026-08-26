-- Migration 068: suporte por ticket, com atendimento do agente de IA
--
-- Primeira etapa: o chamado nasce DENTRO do sistema. A caixa
-- suporte@duofuturo.tech continua recebendo e-mail normalmente, mas a leitura
-- dela (IMAP → ticket) fica para uma segunda etapa — por isso já existe a
-- coluna `canal`, para o dia em que o ticket puder vir de fora sem migration.
--
-- Quem responde primeiro é o agente de IA; a resposta dele fica marcada como
-- tal em `ticket_mensagens.autor`, porque um cliente tem o direito de saber se
-- está falando com uma pessoa. Quando ele pede gente, `status` vai para
-- 'aguardando_suporte' e a equipe assume.

BEGIN;

CREATE TABLE IF NOT EXISTS tickets (
  id             serial PRIMARY KEY,
  empresa_id     integer     NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id     integer     NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  assunto        varchar(200) NOT NULL,
  categoria      varchar(30)  NOT NULL DEFAULT 'duvida',
  -- duvida | problema | sugestao | cobranca
  prioridade     varchar(20)  NOT NULL DEFAULT 'normal',
  -- baixa | normal | alta
  status         varchar(30)  NOT NULL DEFAULT 'aberto',
  -- aberto | aguardando_cliente | aguardando_suporte | resolvido | fechado
  canal          varchar(20)  NOT NULL DEFAULT 'sistema',
  -- sistema | email  (email entra na 2ª etapa, com a leitura da caixa)
  email_contato  varchar(255),
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  resolvido_at   timestamptz
);

COMMENT ON TABLE  tickets        IS 'Chamados de suporte abertos pelos clientes';
COMMENT ON COLUMN tickets.canal  IS 'Origem do chamado; email fica para quando a caixa suporte@ for lida por IMAP';
COMMENT ON COLUMN tickets.status IS 'aguardando_cliente = a bola está com quem abriu; aguardando_suporte = a IA passou para a equipe';

CREATE INDEX IF NOT EXISTS idx_tickets_empresa ON tickets(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_usuario ON tickets(usuario_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status  ON tickets(status, created_at DESC);

CREATE TABLE IF NOT EXISTS ticket_mensagens (
  id          serial PRIMARY KEY,
  ticket_id   integer     NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  autor       varchar(20) NOT NULL,
  -- cliente | agente_ia | suporte
  usuario_id  integer     REFERENCES usuarios(id) ON DELETE SET NULL,
  conteudo    text        NOT NULL,
  -- Marca a resposta que a IA deu sozinha, para medir quanto ela resolve.
  automatica  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN ticket_mensagens.autor IS 'Quem escreveu — o cliente vê o rótulo, não pode achar que a IA é uma pessoa';

CREATE INDEX IF NOT EXISTS idx_ticket_mensagens_ticket ON ticket_mensagens(ticket_id, created_at);

-- As tabelas referenciadas (empresas, usuarios) pertencem ao postgres, então
-- esta migration roda como ele — igual à 064 e à 067. Sem os GRANTs a API, que
-- conecta como gestao_user, não enxerga o que acabou de ser criado.
GRANT SELECT, INSERT, UPDATE, DELETE ON tickets, ticket_mensagens TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE tickets_id_seq, ticket_mensagens_id_seq TO gestao_user;

COMMIT;
