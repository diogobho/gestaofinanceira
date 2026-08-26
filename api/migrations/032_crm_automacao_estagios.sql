-- Migration 032: Automação de estágios no CRM
-- Feature 1: Após disparo, mover lead para estágio configurado
-- Feature 2: Ao lead responder, mover lead para estágio configurado

-- Campo no disparo: estágio destino após envio da mensagem
ALTER TABLE disparos_crm
  ADD COLUMN IF NOT EXISTS estagio_pos_disparo_id INTEGER
  REFERENCES estagios_funil(id) ON DELETE SET NULL;

-- Campo no estágio: estágio destino quando o lead responder
ALTER TABLE estagios_funil
  ADD COLUMN IF NOT EXISTS estagio_apos_resposta_id INTEGER
  REFERENCES estagios_funil(id) ON DELETE SET NULL;
