-- Migration 057: Criação automática de lead a partir de mensagens do WhatsApp, por estágio
--
-- Um estágio pode ativar a criação automática de leads: quando um contato manda
-- mensagem em um número (usuário/proprietário) da empresa, um lead é criado nesse
-- funil+estágio — respeitando a regra de duplicidade por funil (não recria se já
-- existe lead do mesmo contato naquele funil).
--
-- auto_criar_lead_usuarios: lista de usuario_id (números/proprietários) cujas
-- mensagens recebidas disparam a criação. NULL ou vazio = TODOS os números da empresa.

BEGIN;

ALTER TABLE estagios_funil
  ADD COLUMN IF NOT EXISTS auto_criar_lead          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_criar_lead_usuarios integer[];

COMMENT ON COLUMN estagios_funil.auto_criar_lead          IS 'Se true, mensagens recebidas no WhatsApp criam lead automaticamente neste funil+estágio';
COMMENT ON COLUMN estagios_funil.auto_criar_lead_usuarios IS 'usuario_id (números) que disparam a criação; NULL/vazio = todos os números da empresa';

COMMIT;
