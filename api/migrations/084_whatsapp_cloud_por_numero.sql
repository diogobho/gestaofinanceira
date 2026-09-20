-- 084 — O número oficial passa a ser POR NÚMERO, não por empresa (20/09/2026).
--
-- A 074 nasceu com `empresa_id UNIQUE`: uma empresa, um número oficial, todo mundo
-- dela na mesma porta virtual. Serviu para a DuoFuturo, que tem um número só e o
-- usa como caixa de entrada do Suporte. Não serve para um cliente Enterprise: lá
-- cada operador tem o SEU número, a migração do QR para a Cloud API é um operador
-- de cada vez, e no meio do caminho a empresa fica com os dois canais no ar.
--
-- O esquema da 074 já era, na prática, uma tabela por número — `porta_virtual` e
-- `phone_number_id` são UNIQUE, `token_enc` é por linha, e a entrada acha a conta
-- pelo `phone_number_id` e o dono pela `porta_virtual`. O que travava era uma
-- constraint. Por isso aqui não nasce tabela nova: alargar a 074 evita duas fontes
-- para a mesma pergunta ("esta porta é Cloud?").
--
-- `usuario_id IS NULL` continua significando "número da empresa inteira" — é o caso
-- da empresa 1 hoje, que não é tocada por esta migration.

ALTER TABLE whatsapp_cloud_contas DROP CONSTRAINT IF EXISTS whatsapp_cloud_contas_empresa_id_key;

ALTER TABLE whatsapp_cloud_contas
  ADD COLUMN IF NOT EXISTS usuario_id      integer REFERENCES usuarios(id) ON DELETE SET NULL,
  -- Portfólio de negócios do cliente. Vem do Embedded Signup e é o que permite
  -- consultar a WABA dele sem adivinhar (a Graph API usa a mesma frase de erro
  -- para "id inexistente" e "sem permissão" — ver docs/META_TECH_PROVIDER.md).
  ADD COLUMN IF NOT EXISTS business_id     varchar(40),
  -- PIN de 6 dígitos do /register. Guardado cifrado porque é ele que permite
  -- registrar o número de novo (e é o que a Meta pede na verificação em duas etapas).
  ADD COLUMN IF NOT EXISTS pin_enc         text,
  ADD COLUMN IF NOT EXISTS qualidade       varchar(12),
  -- A Meta recusa conversa iniciada pela empresa quando não há forma de pagamento
  -- na conta DO CLIENTE. Sem este campo o erro só apareceria no primeiro disparo.
  ADD COLUMN IF NOT EXISTS pagamento_ok    boolean,
  -- 'manual' = cadastrado pela DuoFuturo no painel; 'embedded_signup' = o cliente
  -- autorizou pela janela da Meta. Muda o que a tela diz e quem pode desligar.
  ADD COLUMN IF NOT EXISTS origem          varchar(20) NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS conectado_em    timestamptz;

-- Um número por usuário; e no máximo um número "da empresa inteira" por empresa.
-- Índices parciais, não constraint: `usuario_id` nulo tem significado próprio e
-- UNIQUE comum deixaria passar duas linhas nulas na mesma empresa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_cloud_conta_por_usuario
  ON whatsapp_cloud_contas (usuario_id) WHERE usuario_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_cloud_conta_da_empresa
  ON whatsapp_cloud_contas (empresa_id) WHERE usuario_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_wa_cloud_contas_empresa ON whatsapp_cloud_contas (empresa_id);

COMMENT ON COLUMN whatsapp_cloud_contas.usuario_id IS
  'Dono do número. NULL = número da empresa inteira (todos os usuários na porta virtual).';
