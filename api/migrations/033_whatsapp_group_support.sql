-- Migration 033: Suporte a mensagens de grupo WhatsApp no CRM
-- Adiciona campos para rastrear qual grupo originou uma mensagem

ALTER TABLE historico_mensagens
    ADD COLUMN IF NOT EXISTS grupo_whatsapp_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS grupo_nome VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_historico_mensagens_grupo_id
    ON historico_mensagens(grupo_whatsapp_id)
    WHERE grupo_whatsapp_id IS NOT NULL;

-- Comentário para documentação
COMMENT ON COLUMN historico_mensagens.grupo_whatsapp_id IS 'ID do grupo WhatsApp (@g.us) quando mensagem veio de um grupo';
COMMENT ON COLUMN historico_mensagens.grupo_nome IS 'Nome do grupo WhatsApp no momento do recebimento';
