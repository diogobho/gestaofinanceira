-- Migration 072 — anexos privados de ticket (Fase 4)
--
-- Print de tela é o anexo que importa num suporte: descrever "o botão fica cinza"
-- por texto custa três idas e voltas que uma imagem resolve.
--
-- ── Por que tabela própria, e não uma coluna em ticket_mensagens ─────────────
-- Um anexo tem metadados que só dizem respeito a ele (tamanho, mimetype, nome
-- original, quem subiu, onde está no disco) e a mensagem pode ter mais de um no
-- futuro. Coluna solta obrigaria a repetir tudo isso em cada linha do histórico —
-- inclusive nas notas internas e nos eventos, que nunca têm anexo.
--
-- ── Por que o arquivo NÃO fica no banco ─────────────────────────────────────
-- `bytea` num Postgres compartilhado transforma backup e replicação num problema
-- proporcional ao volume de prints. O binário vai para o disco, sob
-- /uploads/suporte/{empresa_id}/, e o banco guarda o caminho — mesma decisão da
-- mídia de WhatsApp.
--
-- ── Segurança ───────────────────────────────────────────────────────────────
-- `caminho` é gerado pelo servidor com UUID, nunca com o nome que o cliente
-- mandou: nome de arquivo é entrada não confiável (path traversal, extensão dupla,
-- caractere de controle). `nome_original` guarda o nome de exibição, e é só isso —
-- ele nunca toca o filesystem. O download passa por rota autenticada que confere a
-- empresa do ticket; nada em /uploads/suporte/ é servido estaticamente.
--
-- ATENÇÃO: rode como `postgres`, dono das tabelas de suporte:
--   sudo -u postgres psql -d gestao_financeira -f 072_suporte_anexos.sql

BEGIN;

CREATE TABLE IF NOT EXISTS ticket_anexos (
  id             serial PRIMARY KEY,
  ticket_id      integer      NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  -- A mensagem à qual o anexo pertence. Nullable porque o upload acontece ANTES
  -- de a mensagem existir (o cliente escolhe o arquivo, depois envia o texto):
  -- o anexo nasce órfão e é amarrado na mesma transação que grava a mensagem.
  mensagem_id    integer      REFERENCES ticket_mensagens(id) ON DELETE CASCADE,
  empresa_id     integer      NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id     integer      NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  -- Caminho relativo no disco, com nome gerado por UUID pelo servidor.
  caminho        varchar(500) NOT NULL,
  -- Nome que o cliente vê. NUNCA usado para montar caminho.
  nome_original  varchar(255) NOT NULL,
  mimetype       varchar(120) NOT NULL,
  tamanho_bytes  integer      NOT NULL,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ticket_anexos_tamanho_positivo CHECK (tamanho_bytes > 0)
);

-- Leitura sempre pelo ticket (para listar) ou pela mensagem (para renderizar).
CREATE INDEX IF NOT EXISTS idx_ticket_anexos_ticket   ON ticket_anexos (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_anexos_mensagem ON ticket_anexos (mensagem_id);
-- O caminho é a chave de autorização do download: tem de ser único e indexado.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_anexos_caminho ON ticket_anexos (caminho);

COMMENT ON TABLE  ticket_anexos            IS 'Anexos de chamado de suporte. Binário no disco; nada servido estaticamente';
COMMENT ON COLUMN ticket_anexos.caminho    IS 'Caminho relativo com nome UUID gerado pelo servidor. Chave de autorização do download';
COMMENT ON COLUMN ticket_anexos.nome_original IS 'Nome de exibição informado pelo cliente. Entrada não confiável: nunca compõe caminho';
COMMENT ON COLUMN ticket_anexos.mensagem_id IS 'NULL enquanto o anexo aguarda a mensagem que o acompanha (upload precede o envio)';

GRANT SELECT, INSERT, UPDATE, DELETE ON ticket_anexos TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE ticket_anexos_id_seq TO gestao_user;

COMMIT;
