-- Migration: Adicionar parcela_id em notificacoes_enviadas
-- Data: 2025-11-13
-- Descrição: Permite rastrear notificações por parcela específica

-- Adicionar coluna parcela_id (UUID)
ALTER TABLE notificacoes_enviadas
ADD COLUMN IF NOT EXISTS parcela_id UUID REFERENCES parcelas_receitas(id) ON DELETE SET NULL;

-- Criar índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_notificacoes_enviadas_parcela_id ON notificacoes_enviadas(parcela_id);

-- Comentários
COMMENT ON COLUMN notificacoes_enviadas.parcela_id IS 'ID da parcela relacionada à notificação (para cobranças manuais)';
