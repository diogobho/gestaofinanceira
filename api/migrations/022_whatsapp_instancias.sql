-- ============================================
-- Migration: 022_whatsapp_instancias.sql
-- Descrição: Suporte a múltiplas instâncias WhatsApp por empresa
-- Data: 2026-01-28
-- ============================================

-- Tabela de instâncias WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_instancias (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    porta INTEGER NOT NULL UNIQUE,
    session_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'desconectado', -- desconectado, conectando, conectado, erro
    qrcode_data TEXT,
    numero_conectado VARCHAR(20),
    ultimo_ping TIMESTAMP,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_whatsapp_instancias_empresa ON whatsapp_instancias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instancias_porta ON whatsapp_instancias(porta);

-- Adicionar coluna whatsapp_instancia_id na tabela leads (opcional, para rastrear origem)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'leads' AND column_name = 'whatsapp_instancia_id'
    ) THEN
        ALTER TABLE leads ADD COLUMN whatsapp_instancia_id INTEGER REFERENCES whatsapp_instancias(id) ON DELETE SET NULL;
    END IF;
END$$;

-- Adicionar coluna whatsapp_instancia_id na tabela contatos_whatsapp
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'contatos_whatsapp' AND column_name = 'whatsapp_instancia_id'
    ) THEN
        ALTER TABLE contatos_whatsapp ADD COLUMN whatsapp_instancia_id INTEGER REFERENCES whatsapp_instancias(id) ON DELETE SET NULL;
    END IF;
END$$;

-- Adicionar coluna whatsapp_instancia_id na tabela historico_mensagens
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'historico_mensagens' AND column_name = 'whatsapp_instancia_id'
    ) THEN
        ALTER TABLE historico_mensagens ADD COLUMN whatsapp_instancia_id INTEGER REFERENCES whatsapp_instancias(id) ON DELETE SET NULL;
    END IF;
END$$;

-- Migrar dados existentes: criar instâncias a partir das portas dos usuários
-- Para cada usuário com whatsapp_porta, criar uma instância para a empresa
DO $$
DECLARE
    r RECORD;
    inst_id INTEGER;
BEGIN
    FOR r IN
        SELECT DISTINCT u.empresa_id, u.whatsapp_porta
        FROM usuarios u
        WHERE u.whatsapp_porta IS NOT NULL
        AND u.empresa_id IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM whatsapp_instancias wi
            WHERE wi.porta = u.whatsapp_porta
        )
    LOOP
        INSERT INTO whatsapp_instancias (empresa_id, nome, porta, session_name)
        VALUES (
            r.empresa_id,
            'Instância Principal',
            r.whatsapp_porta,
            'session_' || r.empresa_id
        )
        RETURNING id INTO inst_id;

        -- Atualizar contatos existentes desta empresa para usar esta instância
        UPDATE contatos_whatsapp
        SET whatsapp_instancia_id = inst_id
        WHERE empresa_id = r.empresa_id
        AND whatsapp_instancia_id IS NULL;

        -- Atualizar histórico de mensagens
        UPDATE historico_mensagens
        SET whatsapp_instancia_id = inst_id
        WHERE empresa_id = r.empresa_id
        AND whatsapp_instancia_id IS NULL;

        RAISE NOTICE 'Criada instância % para empresa % na porta %', inst_id, r.empresa_id, r.whatsapp_porta;
    END LOOP;
END$$;

-- Comentário explicativo
COMMENT ON TABLE whatsapp_instancias IS 'Instâncias WhatsApp por empresa - permite múltiplos números por empresa';
COMMENT ON COLUMN whatsapp_instancias.status IS 'Status: desconectado, conectando, conectado, erro';
COMMENT ON COLUMN whatsapp_instancias.qrcode_data IS 'QR Code em base64 quando status = conectando';
