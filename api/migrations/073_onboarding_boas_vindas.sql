-- Migration 073: boas-vindas por plano, opt-in de WhatsApp e acompanhamento
--
-- O que muda no produto:
--
-- 1) O e-mail de boas-vindas deixa de ser um só para todo mundo. Cada plano tem
--    o SEU conteúdo, porque a pessoa que assinou o Starter não tem o que fazer
--    com "conecte o seu WhatsApp e monte o funil" — e o Enterprise precisa ouvir
--    do agente de IA, que o texto único nunca mencionava.
--
-- 2) O WhatsApp de boas-vindas passa a ser OPT-IN e sai pelo número oficial
--    (Cloud API). Antes ele saía sozinho, sem pedir, por uma instância Baileys
--    não oficial — exatamente o disparo que faz um número ser bloqueado.
--    Como a Meta não deixa NÓS iniciarmos a conversa sem modelo aprovado, quem
--    manda a primeira mensagem é o cliente (link wa.me pronto na confirmação do
--    cadastro); isso abre a janela de 24h em que podemos responder com o texto
--    e o PDF do plano. Daí os dois estados separados — `aguardando_contato`
--    (a pessoa pediu, ainda não escreveu) e `contato_recebido` (escreveu).
--
-- 3) Nada disso é invisível: `onboarding_envios` guarda o que cada conta nova
--    recebeu, por canal, com o erro legível quando falha. É o que a tela de
--    acompanhamento (super_admin) lê.
--
-- Os modelos ficam em tabela, e não no código, para a equipe corrigir um texto
-- sem deploy. O molde HTML (cabeçalho, rodapé, assinatura) continua na landing:
-- aqui mora só o miolo que muda de plano para plano.
--
-- Rodar como `postgres` (dono das tabelas, como a 064/067/068) — os GRANTs
-- abaixo são o que deixa a API, que conecta como gestao_user, enxergá-las.

BEGIN;

-- ── Modelos editáveis, um por plano ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_modelos (
  plano_id        integer PRIMARY KEY REFERENCES planos(id) ON DELETE CASCADE,
  email_assunto   varchar(200) NOT NULL,
  -- Miolo do e-mail (fragmento HTML). O molde de fora vem da landing.
  email_corpo     text         NOT NULL,
  -- Texto que o número oficial responde a quem pede o material pelo WhatsApp.
  whatsapp_texto  text         NOT NULL,
  -- Nome do arquivo dentro de landing/onboarding/ — um PDF por plano.
  pdf_arquivo     varchar(120) NOT NULL,
  atualizado_por  integer      REFERENCES usuarios(id) ON DELETE SET NULL,
  updated_at      timestamp    NOT NULL DEFAULT now()
);

-- ── Um registro por conta nova: o que foi enviado, quando e o que falhou ─────
CREATE TABLE IF NOT EXISTS onboarding_envios (
  id                serial PRIMARY KEY,
  empresa_id        integer NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id        integer REFERENCES usuarios(id) ON DELETE SET NULL,
  plano_id          integer REFERENCES planos(id),
  plano_nome        varchar(100),
  -- Situação da assinatura no momento do cadastro: trial | aguardando_pagamento.
  assinatura_status varchar(30),
  nome_usuario      varchar(200),
  nome_empresa      varchar(200),
  email             varchar(255),
  -- Só dígitos, como em todo o resto do sistema (_shared/telefone.ts).
  telefone          varchar(20),

  -- Código curto que a pessoa manda no WhatsApp. É ele que liga a mensagem
  -- recebida à conta: o telefone do cadastro pode estar em formato diferente do
  -- que a Meta entrega, e duas contas podem compartilhar um número.
  codigo            varchar(8) NOT NULL UNIQUE,

  email_status      varchar(20) NOT NULL DEFAULT 'pendente',  -- pendente|enviado|falhou
  email_erro        text,
  email_message_id  text,
  email_em          timestamp,

  -- LGPD: o consentimento e quando ele foi dado.
  whatsapp_optin    boolean NOT NULL DEFAULT false,
  optin_em          timestamp,
  optin_ip          varchar(45),

  -- nao_solicitado | aguardando_contato | contato_recebido | enviado | falhou
  whatsapp_status   varchar(24) NOT NULL DEFAULT 'nao_solicitado',
  whatsapp_erro     text,
  whatsapp_message_id text,
  contato_em        timestamp,
  whatsapp_em       timestamp,

  criado_at         timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_envios_empresa  ON onboarding_envios (empresa_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_envios_criado   ON onboarding_envios (criado_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_envios_telefone ON onboarding_envios (telefone);

-- ── Mensagens recebidas no número oficial ────────────────────────────────────
-- `message_id` é UNIQUE de propósito: a Meta reentrega o mesmo evento quando
-- não recebe o 200 a tempo, e são 3 instâncias no cluster. O INSERT ... ON
-- CONFLICT DO NOTHING RETURNING id é o claim atômico que garante UMA entrega.
CREATE TABLE IF NOT EXISTS onboarding_mensagens (
  id          serial PRIMARY KEY,
  message_id  varchar(160) NOT NULL UNIQUE,
  de_numero   varchar(20)  NOT NULL,
  tipo        varchar(24),
  texto       text,
  envio_id    integer REFERENCES onboarding_envios(id) ON DELETE SET NULL,
  -- o que foi feito: material_enviado | sem_conta | ja_enviado | falhou
  desfecho    varchar(24),
  erro        text,
  recebida_em timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_mensagens_recebida ON onboarding_mensagens (recebida_em DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON onboarding_modelos, onboarding_envios, onboarding_mensagens TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE onboarding_envios_id_seq, onboarding_mensagens_id_seq TO gestao_user;

COMMIT;
