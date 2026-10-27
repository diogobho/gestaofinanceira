-- Migration 020: WhatsApp Media Support + Unread Tracking
-- Adiciona suporte a mídia no histórico e tracking de mensagens não lidas

-- =====================================================
-- 1. Campos de mídia no histórico de mensagens
-- =====================================================
ALTER TABLE historico_mensagens ADD COLUMN IF NOT EXISTS media_filename VARCHAR(255);
ALTER TABLE historico_mensagens ADD COLUMN IF NOT EXISTS media_mimetype VARCHAR(100);
ALTER TABLE historico_mensagens ADD COLUMN IF NOT EXISTS media_tamanho INTEGER;

-- =====================================================
-- 2. Tracking de não lidos e resposta no lead
-- =====================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS mensagens_nao_lidas INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS aguardando_resposta BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ultima_resposta_cliente_at TIMESTAMP;

-- =====================================================
-- 3. Tracking de não lidos no contato WhatsApp
-- =====================================================
ALTER TABLE contatos_whatsapp ADD COLUMN IF NOT EXISTS mensagens_nao_lidas INTEGER DEFAULT 0;

-- =====================================================
-- 4. Índices para queries de não lidos
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_leads_nao_lidas ON leads(empresa_id, mensagens_nao_lidas) WHERE mensagens_nao_lidas > 0;
CREATE INDEX IF NOT EXISTS idx_leads_aguardando ON leads(empresa_id, aguardando_resposta) WHERE aguardando_resposta = true;
CREATE INDEX IF NOT EXISTS idx_historico_lido ON historico_mensagens(contato_whatsapp_id, lido_at) WHERE lido_at IS NULL AND direcao = 'entrada';
