-- Migration: Adicionar suporte para WhatsApp Multi-Usuário
-- Data: 28/11/2025
-- Descrição: Permite que cada usuário tenha sua própria instância WhatsApp

-- Adicionar colunas para integração WhatsApp
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS whatsapp_porta INTEGER,
ADD COLUMN IF NOT EXISTS whatsapp_conectado BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS whatsapp_ultima_conexao TIMESTAMPTZ;

-- Comentários
COMMENT ON COLUMN usuarios.whatsapp_porta IS 'Porta da instância WhatsApp do usuário (ex: 3011, 3012, 3013)';
COMMENT ON COLUMN usuarios.whatsapp_conectado IS 'Indica se o WhatsApp está atualmente conectado';
COMMENT ON COLUMN usuarios.whatsapp_ultima_conexao IS 'Timestamp da última vez que o WhatsApp foi conectado com sucesso';

-- Criar índice para otimizar queries
CREATE INDEX IF NOT EXISTS idx_usuarios_whatsapp_porta ON usuarios(whatsapp_porta) WHERE whatsapp_porta IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_whatsapp_conectado ON usuarios(whatsapp_conectado) WHERE whatsapp_conectado = TRUE;

-- Exemplo de configuração (ajuste conforme necessário)
-- UPDATE usuarios SET whatsapp_porta = 3011, whatsapp_conectado = FALSE WHERE email = 'master@gestao.com';
