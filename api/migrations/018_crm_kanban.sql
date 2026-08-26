-- ============================================
-- Migration: 018_crm_kanban.sql
-- Descrição: CRM Kanban com integração WhatsApp
-- Data: 2026-01-24
-- ============================================

-- ========================================
-- TABELA: funis (Funis de Venda)
-- ========================================
CREATE TABLE IF NOT EXISTS funis (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    ativo BOOLEAN DEFAULT true,
    padrao BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_funil_nome_usuario UNIQUE(usuario_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_funis_usuario_id ON funis(usuario_id);
CREATE INDEX IF NOT EXISTS idx_funis_padrao ON funis(usuario_id, padrao) WHERE padrao = true;

-- ========================================
-- TABELA: estagios_funil (Colunas do Kanban)
-- ========================================
CREATE TABLE IF NOT EXISTS estagios_funil (
    id SERIAL PRIMARY KEY,
    funil_id INTEGER NOT NULL REFERENCES funis(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    descricao TEXT,
    cor VARCHAR(7) DEFAULT '#6B7280',
    icone VARCHAR(50),
    ordem INTEGER NOT NULL DEFAULT 0,
    is_entrada BOOLEAN DEFAULT false,
    is_ganho BOOLEAN DEFAULT false,
    is_perdido BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_estagios_funil_id ON estagios_funil(funil_id);
CREATE INDEX IF NOT EXISTS idx_estagios_ordem ON estagios_funil(funil_id, ordem);

-- ========================================
-- TABELA: contatos_whatsapp (Contatos Sincronizados)
-- ========================================
CREATE TABLE IF NOT EXISTS contatos_whatsapp (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    whatsapp_id VARCHAR(50) NOT NULL,
    numero VARCHAR(20) NOT NULL,
    nome VARCHAR(255),
    nome_push VARCHAR(255),
    foto_url TEXT,
    is_grupo BOOLEAN DEFAULT false,
    ultima_mensagem TEXT,
    ultima_mensagem_at TIMESTAMP,
    sincronizado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_contato_whatsapp_usuario UNIQUE(usuario_id, whatsapp_id)
);

CREATE INDEX IF NOT EXISTS idx_contatos_whatsapp_usuario ON contatos_whatsapp(usuario_id);
CREATE INDEX IF NOT EXISTS idx_contatos_whatsapp_numero ON contatos_whatsapp(numero);
CREATE INDEX IF NOT EXISTS idx_contatos_whatsapp_is_grupo ON contatos_whatsapp(usuario_id, is_grupo);

-- ========================================
-- TABELA: leads (Oportunidades/Cards do Kanban)
-- ========================================
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    funil_id INTEGER NOT NULL REFERENCES funis(id) ON DELETE CASCADE,
    estagio_id INTEGER NOT NULL REFERENCES estagios_funil(id) ON DELETE RESTRICT,
    contato_whatsapp_id INTEGER REFERENCES contatos_whatsapp(id) ON DELETE SET NULL,

    -- Dados do Lead
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(20),
    email VARCHAR(255),
    empresa VARCHAR(255),
    cargo VARCHAR(100),

    -- Dados da Oportunidade
    titulo VARCHAR(255),
    valor_potencial DECIMAL(12, 2) DEFAULT 0,
    moeda VARCHAR(3) DEFAULT 'BRL',

    -- Datas importantes
    data_entrada TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_previsao_fechamento DATE,
    data_ultimo_contato TIMESTAMP,
    data_ganho_perdido TIMESTAMP,

    -- Status e Qualificação
    temperatura VARCHAR(20) DEFAULT 'morno',
    probabilidade INTEGER DEFAULT 50,
    motivo_perda TEXT,

    -- Metadados
    origem VARCHAR(50) DEFAULT 'manual',
    notas TEXT,
    ordem_estagio INTEGER DEFAULT 0,
    arquivado BOOLEAN DEFAULT false,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT leads_temperatura_check CHECK (temperatura IN ('frio', 'morno', 'quente')),
    CONSTRAINT leads_probabilidade_check CHECK (probabilidade >= 0 AND probabilidade <= 100),
    CONSTRAINT leads_origem_check CHECK (origem IN ('whatsapp', 'manual', 'importacao', 'indicacao'))
);

CREATE INDEX IF NOT EXISTS idx_leads_usuario ON leads(usuario_id);
CREATE INDEX IF NOT EXISTS idx_leads_funil ON leads(funil_id);
CREATE INDEX IF NOT EXISTS idx_leads_estagio ON leads(estagio_id);
CREATE INDEX IF NOT EXISTS idx_leads_contato ON leads(contato_whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_leads_arquivado ON leads(usuario_id, arquivado);
CREATE INDEX IF NOT EXISTS idx_leads_temperatura ON leads(temperatura);

-- ========================================
-- TABELA: tags (Etiquetas para Leads)
-- ========================================
CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nome VARCHAR(50) NOT NULL,
    cor VARCHAR(7) DEFAULT '#3B82F6',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_tag_nome_usuario UNIQUE(usuario_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_tags_usuario ON tags(usuario_id);

-- ========================================
-- TABELA: lead_tags (Relacionamento N:N)
-- ========================================
CREATE TABLE IF NOT EXISTS lead_tags (
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_tags_lead ON lead_tags(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_tags_tag ON lead_tags(tag_id);

-- ========================================
-- TABELA: mensagens_templates (Templates por Estágio)
-- ========================================
CREATE TABLE IF NOT EXISTS mensagens_templates (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    estagio_id INTEGER REFERENCES estagios_funil(id) ON DELETE SET NULL,
    nome VARCHAR(100) NOT NULL,
    titulo VARCHAR(100),
    conteudo TEXT NOT NULL,
    variaveis JSONB DEFAULT '[]',
    tipo VARCHAR(20) DEFAULT 'texto',
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT templates_tipo_check CHECK (tipo IN ('texto', 'imagem', 'documento', 'audio'))
);

CREATE INDEX IF NOT EXISTS idx_templates_usuario ON mensagens_templates(usuario_id);
CREATE INDEX IF NOT EXISTS idx_templates_estagio ON mensagens_templates(estagio_id);
CREATE INDEX IF NOT EXISTS idx_templates_ativo ON mensagens_templates(usuario_id, ativo);

-- ========================================
-- TABELA: atividades_lead (Histórico/Timeline)
-- ========================================
CREATE TABLE IF NOT EXISTS atividades_lead (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

    tipo VARCHAR(30) NOT NULL,
    descricao TEXT,
    dados JSONB,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT atividades_tipo_check CHECK (tipo IN (
        'criacao', 'mudanca_estagio', 'mensagem_enviada', 'mensagem_recebida',
        'nota', 'ligacao', 'email', 'tarefa', 'tag_adicionada', 'tag_removida',
        'atualizacao', 'arquivado', 'reativado'
    ))
);

CREATE INDEX IF NOT EXISTS idx_atividades_lead ON atividades_lead(lead_id);
CREATE INDEX IF NOT EXISTS idx_atividades_tipo ON atividades_lead(tipo);
CREATE INDEX IF NOT EXISTS idx_atividades_created ON atividades_lead(lead_id, created_at DESC);

-- ========================================
-- TABELA: historico_mensagens (Mensagens WhatsApp)
-- ========================================
CREATE TABLE IF NOT EXISTS historico_mensagens (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    contato_whatsapp_id INTEGER REFERENCES contatos_whatsapp(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

    whatsapp_message_id VARCHAR(100),
    direcao VARCHAR(10) NOT NULL,
    tipo VARCHAR(20) DEFAULT 'texto',
    conteudo TEXT,
    media_url TEXT,

    enviado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    lido_at TIMESTAMP,
    entregue_at TIMESTAMP,
    erro TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT historico_direcao_check CHECK (direcao IN ('entrada', 'saida')),
    CONSTRAINT historico_tipo_check CHECK (tipo IN ('texto', 'imagem', 'audio', 'documento', 'video', 'sticker', 'location'))
);

CREATE INDEX IF NOT EXISTS idx_historico_lead ON historico_mensagens(lead_id);
CREATE INDEX IF NOT EXISTS idx_historico_contato ON historico_mensagens(contato_whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_historico_usuario ON historico_mensagens(usuario_id);
CREATE INDEX IF NOT EXISTS idx_historico_enviado ON historico_mensagens(enviado_at DESC);

-- ========================================
-- TRIGGERS: Atualizar updated_at
-- ========================================
CREATE OR REPLACE FUNCTION update_crm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_funis_updated_at ON funis;
CREATE TRIGGER trigger_funis_updated_at
    BEFORE UPDATE ON funis
    FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

DROP TRIGGER IF EXISTS trigger_estagios_updated_at ON estagios_funil;
CREATE TRIGGER trigger_estagios_updated_at
    BEFORE UPDATE ON estagios_funil
    FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

DROP TRIGGER IF EXISTS trigger_contatos_whatsapp_updated_at ON contatos_whatsapp;
CREATE TRIGGER trigger_contatos_whatsapp_updated_at
    BEFORE UPDATE ON contatos_whatsapp
    FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

DROP TRIGGER IF EXISTS trigger_leads_updated_at ON leads;
CREATE TRIGGER trigger_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

DROP TRIGGER IF EXISTS trigger_templates_updated_at ON mensagens_templates;
CREATE TRIGGER trigger_templates_updated_at
    BEFORE UPDATE ON mensagens_templates
    FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

-- ========================================
-- VIEW: leads_kanban (View otimizada para o Kanban)
-- ========================================
CREATE OR REPLACE VIEW leads_kanban AS
SELECT
    l.id,
    l.usuario_id,
    l.funil_id,
    l.estagio_id,
    l.contato_whatsapp_id,
    l.nome,
    l.telefone,
    l.email,
    l.empresa,
    l.titulo,
    l.valor_potencial,
    l.moeda,
    l.temperatura,
    l.probabilidade,
    l.data_entrada,
    l.data_ultimo_contato,
    l.ordem_estagio,
    l.origem,
    l.arquivado,
    l.created_at,
    l.updated_at,
    e.nome AS estagio_nome,
    e.cor AS estagio_cor,
    e.ordem AS estagio_ordem,
    e.is_entrada,
    e.is_ganho,
    e.is_perdido,
    cw.foto_url,
    cw.ultima_mensagem,
    cw.ultima_mensagem_at,
    cw.numero AS whatsapp_numero
FROM leads l
JOIN estagios_funil e ON l.estagio_id = e.id
LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id;

-- ========================================
-- VIEW: contatos_nao_convertidos
-- ========================================
CREATE OR REPLACE VIEW contatos_nao_convertidos AS
SELECT
    cw.*,
    (SELECT COUNT(*) FROM historico_mensagens hm WHERE hm.contato_whatsapp_id = cw.id) as total_mensagens
FROM contatos_whatsapp cw
WHERE cw.is_grupo = false
AND cw.id NOT IN (
    SELECT contato_whatsapp_id FROM leads WHERE contato_whatsapp_id IS NOT NULL
);

-- ========================================
-- FUNÇÃO: Criar funil padrão para usuário
-- ========================================
CREATE OR REPLACE FUNCTION criar_funil_padrao(p_usuario_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_funil_id INTEGER;
BEGIN
    -- Verificar se já existe funil padrão
    SELECT id INTO v_funil_id FROM funis
    WHERE usuario_id = p_usuario_id AND padrao = true;

    IF v_funil_id IS NOT NULL THEN
        RETURN v_funil_id;
    END IF;

    -- Criar funil
    INSERT INTO funis (usuario_id, nome, descricao, padrao)
    VALUES (p_usuario_id, 'Funil Principal', 'Funil padrão de vendas', true)
    RETURNING id INTO v_funil_id;

    -- Criar estágios padrão
    INSERT INTO estagios_funil (funil_id, nome, cor, icone, ordem, is_entrada) VALUES
    (v_funil_id, 'Novos', '#6B7280', 'inbox', 1, true);

    INSERT INTO estagios_funil (funil_id, nome, cor, icone, ordem) VALUES
    (v_funil_id, '1º Contato', '#3B82F6', 'message-circle', 2),
    (v_funil_id, 'Qualificação', '#8B5CF6', 'target', 3),
    (v_funil_id, 'Proposta', '#F59E0B', 'file-text', 4),
    (v_funil_id, 'Negociação', '#EF4444', 'dollar-sign', 5);

    INSERT INTO estagios_funil (funil_id, nome, cor, icone, ordem, is_ganho) VALUES
    (v_funil_id, 'Ganho', '#10B981', 'check-circle', 6, true);

    INSERT INTO estagios_funil (funil_id, nome, cor, icone, ordem, is_perdido) VALUES
    (v_funil_id, 'Perdido', '#6B7280', 'x-circle', 7, true);

    RETURN v_funil_id;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- Criar funil padrão para usuário master@gestao.com
-- ========================================
DO $$
DECLARE
    v_usuario_id INTEGER;
BEGIN
    SELECT id INTO v_usuario_id FROM usuarios WHERE email = 'master@gestao.com';
    IF v_usuario_id IS NOT NULL THEN
        PERFORM criar_funil_padrao(v_usuario_id);
        RAISE NOTICE 'Funil padrão criado para master@gestao.com';
    END IF;
END $$;

-- ========================================
-- Configurar porta WhatsApp para master@gestao.com se não existir
-- ========================================
UPDATE usuarios
SET whatsapp_porta = 3011
WHERE email = 'master@gestao.com'
AND (whatsapp_porta IS NULL OR whatsapp_porta = 0);

-- ========================================
-- Criar tags padrão para master@gestao.com
-- ========================================
DO $$
DECLARE
    v_usuario_id INTEGER;
BEGIN
    SELECT id INTO v_usuario_id FROM usuarios WHERE email = 'master@gestao.com';
    IF v_usuario_id IS NOT NULL THEN
        INSERT INTO tags (usuario_id, nome, cor) VALUES
        (v_usuario_id, 'Urgente', '#EF4444'),
        (v_usuario_id, 'VIP', '#F59E0B'),
        (v_usuario_id, 'Indicação', '#10B981'),
        (v_usuario_id, 'Retorno', '#3B82F6')
        ON CONFLICT (usuario_id, nome) DO NOTHING;
    END IF;
END $$;

-- ========================================
-- COMENTÁRIOS NAS TABELAS
-- ========================================
COMMENT ON TABLE funis IS 'Funis de venda do CRM Kanban';
COMMENT ON TABLE estagios_funil IS 'Estágios/colunas do funil Kanban';
COMMENT ON TABLE contatos_whatsapp IS 'Contatos sincronizados do WhatsApp';
COMMENT ON TABLE leads IS 'Leads/oportunidades (cards do Kanban)';
COMMENT ON TABLE tags IS 'Tags/etiquetas para categorizar leads';
COMMENT ON TABLE lead_tags IS 'Relação N:N entre leads e tags';
COMMENT ON TABLE mensagens_templates IS 'Templates de mensagem por estágio';
COMMENT ON TABLE atividades_lead IS 'Histórico/timeline de atividades do lead';
COMMENT ON TABLE historico_mensagens IS 'Histórico de mensagens WhatsApp';
COMMENT ON VIEW leads_kanban IS 'View otimizada para exibição do Kanban';
COMMENT ON VIEW contatos_nao_convertidos IS 'Contatos WhatsApp ainda não convertidos em leads';
COMMENT ON FUNCTION criar_funil_padrao IS 'Cria funil padrão com 7 estágios para um usuário';
