-- Migration: Adicionar campo foto_perfil na tabela usuarios
-- Data: 2025-11-13
-- Descrição: Permite que usuários façam upload de foto de perfil

-- Adicionar coluna foto_perfil
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS foto_perfil TEXT;

-- Comentário na coluna
COMMENT ON COLUMN usuarios.foto_perfil IS 'URL ou caminho da foto de perfil do usuário (base64 ou URL)';

-- Criar índice para consultas com foto
CREATE INDEX IF NOT EXISTS idx_usuarios_foto_perfil
ON usuarios(foto_perfil)
WHERE foto_perfil IS NOT NULL;

-- Atualizar data de modificação
UPDATE usuarios SET data_atualizacao = CURRENT_TIMESTAMP
WHERE foto_perfil IS NOT NULL;
