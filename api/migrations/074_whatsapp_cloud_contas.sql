-- 074 — Número oficial (WhatsApp Cloud API da Meta) por empresa.
--
-- Até aqui todo WhatsApp do CRM era um chip conectado por QR (Baileys), um por
-- usuário, cada um numa porta (`usuarios.whatsapp_porta`). A partir de 14/09/2026
-- uma empresa pode falar pelo número oficial — começando pela própria DuoFuturo
-- (empresa 32, +55 11 94052-4435), como beta antes de virarmos Tech Provider.
--
-- `porta_virtual` é o que liga o número oficial ao resto do sistema sem reescrever
-- cada consulta: os usuários da empresa passam a ter `whatsapp_porta` = essa porta,
-- e o módulo `whatsapp/canal` reconhece a porta e fala com a Meta em vez de chamar
-- uma instância. Nada escuta nela. Faixa >= 49000, longe das instâncias (3010–3200).
--
-- `portas_anteriores` guarda a porta Baileys de cada usuário no momento da troca
-- ({"57": 3019}), para desligar o oficial devolva cada um ao chip que tinha.
--
-- `token_enc` nulo = usa o System User da DuoFuturo (META_WA_TOKEN). Quando formos
-- Tech Provider, o Embedded Signup de cada cliente grava o token dele aqui.

CREATE TABLE IF NOT EXISTS whatsapp_cloud_contas (
  id                 serial PRIMARY KEY,
  empresa_id         integer NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
  phone_number_id    varchar(40) NOT NULL UNIQUE,
  waba_id            varchar(40) NOT NULL,
  numero             varchar(20),
  nome_exibicao      varchar(120),
  porta_virtual      integer NOT NULL UNIQUE CHECK (porta_virtual >= 49000),
  token_enc          text,
  ativo              boolean NOT NULL DEFAULT false,
  portas_anteriores  jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativado_em         timestamptz,
  ativado_por        integer REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_at          timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Disparo com modelo aprovado (obrigatório no número oficial para quem não
-- escreveu nas últimas 24h): {"nome","idioma","variaveis":["[Nome]", ...]}.
ALTER TABLE disparos_crm ADD COLUMN IF NOT EXISTS modelo_whatsapp jsonb;

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_cloud_contas TO gestao_user;
GRANT USAGE, SELECT ON SEQUENCE whatsapp_cloud_contas_id_seq TO gestao_user;

-- Nome de usuário do WhatsApp (2026): quem adota pode esconder o telefone, e o
-- webhook passa a trazer só o BSUID (id da pessoa na NOSSA conta Meta, "BR.xxxx",
-- até ~131 caracteres). Guardamos o BSUID de todo contato que escreve para o número
-- oficial — é por ele que o contato é achado quando o telefone não vier — e o
-- contato que só tem BSUID fica com whatsapp_id = '<BSUID>@bsuid'. (whatsapp_id
-- segue varchar(100): a view contatos_nao_convertidos depende da coluna, e os BSUIDs
-- reais têm ~25 caracteres; o código recusa o que não couber.)
ALTER TABLE contatos_whatsapp ADD COLUMN IF NOT EXISTS bsuid varchar(200);
CREATE INDEX IF NOT EXISTS idx_contatos_whatsapp_bsuid ON contatos_whatsapp (empresa_id, bsuid) WHERE bsuid IS NOT NULL;
