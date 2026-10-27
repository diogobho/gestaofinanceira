-- ============================================
-- Migration: 019_crm_empresas_hierarquia.sql
-- Descrição: Adiciona estrutura de Empresas e Hierarquia de Usuários
-- Data: 2026-01-26
-- ============================================

-- ========================================
-- TABELA: empresas (Tenant Principal)
-- ========================================
CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    razao_social VARCHAR(255),
    cnpj VARCHAR(20) UNIQUE,
    telefone VARCHAR(20),
    email VARCHAR(255),
    endereco TEXT,
    logo_url TEXT,
    cor_primaria VARCHAR(7) DEFAULT '#6366F1',
    ativo BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas(cnpj);
CREATE INDEX IF NOT EXISTS idx_empresas_ativo ON empresas(ativo);

-- ========================================
-- TIPO ENUM: tipo_usuario_crm
-- ========================================
DO $$ BEGIN
    CREATE TYPE tipo_usuario_crm AS ENUM ('master', 'comum');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ========================================
-- ALTERAR TABELA: usuarios (Adicionar empresa_id e tipo)
-- ========================================
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE SET NULL;

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS tipo_usuario tipo_usuario_crm DEFAULT 'comum';

CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_id ON usuarios(empresa_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_tipo ON usuarios(tipo_usuario);

-- ========================================
-- ALTERAR TABELA: funis (empresa_id em vez de usuario_id)
-- ========================================
ALTER TABLE funis
ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_funis_empresa_id ON funis(empresa_id);

-- ========================================
-- ALTERAR TABELA: contatos_whatsapp (empresa_id)
-- ========================================
ALTER TABLE contatos_whatsapp
ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_contatos_whatsapp_empresa ON contatos_whatsapp(empresa_id);

-- ========================================
-- ALTERAR TABELA: leads (empresa_id + responsavel_id)
-- ========================================
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

-- Usuário responsável pelo lead (obrigatório)
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS responsavel_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_empresa ON leads(empresa_id);
CREATE INDEX IF NOT EXISTS idx_leads_responsavel ON leads(responsavel_id);

-- ========================================
-- ALTERAR TABELA: tags (empresa_id)
-- ========================================
ALTER TABLE tags
ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tags_empresa ON tags(empresa_id);

-- ========================================
-- ALTERAR TABELA: mensagens_templates (empresa_id)
-- ========================================
ALTER TABLE mensagens_templates
ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_templates_empresa ON mensagens_templates(empresa_id);

-- ========================================
-- ALTERAR TABELA: historico_mensagens (empresa_id)
-- ========================================
ALTER TABLE historico_mensagens
ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_historico_empresa ON historico_mensagens(empresa_id);

-- ========================================
-- ALTERAR TABELA: atividades_lead (empresa_id)
-- ========================================
ALTER TABLE atividades_lead
ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_atividades_empresa ON atividades_lead(empresa_id);

-- ========================================
-- TABELA: tarefas_lead (Sistema de Tarefas)
-- ========================================
CREATE TABLE IF NOT EXISTS tarefas_lead (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    responsavel_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criado_por_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

    tipo VARCHAR(30) NOT NULL DEFAULT 'follow_up',
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,

    data_vencimento TIMESTAMP NOT NULL,
    data_conclusao TIMESTAMP,

    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    prioridade VARCHAR(20) DEFAULT 'normal',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT tarefas_tipo_check CHECK (tipo IN (
        'ligacao', 'reuniao', 'email', 'follow_up', 'proposta', 'visita', 'outros'
    )),
    CONSTRAINT tarefas_status_check CHECK (status IN (
        'pendente', 'em_andamento', 'concluida', 'cancelada'
    )),
    CONSTRAINT tarefas_prioridade_check CHECK (prioridade IN (
        'baixa', 'normal', 'alta', 'urgente'
    ))
);

CREATE INDEX IF NOT EXISTS idx_tarefas_lead ON tarefas_lead(lead_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_empresa ON tarefas_lead(empresa_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel ON tarefas_lead(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_vencimento ON tarefas_lead(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_tarefas_status ON tarefas_lead(status);

-- ========================================
-- TABELA: anotacoes_lead (Histórico de Anotações)
-- ========================================
CREATE TABLE IF NOT EXISTS anotacoes_lead (
    id SERIAL PRIMARY KEY,
    lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

    conteudo TEXT NOT NULL,
    tipo VARCHAR(20) DEFAULT 'nota',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT anotacoes_tipo_check CHECK (tipo IN ('nota', 'importante', 'lembrete'))
);

CREATE INDEX IF NOT EXISTS idx_anotacoes_lead ON anotacoes_lead(lead_id);
CREATE INDEX IF NOT EXISTS idx_anotacoes_empresa ON anotacoes_lead(empresa_id);
CREATE INDEX IF NOT EXISTS idx_anotacoes_created ON anotacoes_lead(created_at DESC);

-- ========================================
-- TRIGGER: Atualizar updated_at
-- ========================================
DROP TRIGGER IF EXISTS trigger_empresas_updated_at ON empresas;
CREATE TRIGGER trigger_empresas_updated_at
    BEFORE UPDATE ON empresas
    FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

DROP TRIGGER IF EXISTS trigger_tarefas_updated_at ON tarefas_lead;
CREATE TRIGGER trigger_tarefas_updated_at
    BEFORE UPDATE ON tarefas_lead
    FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

DROP TRIGGER IF EXISTS trigger_anotacoes_updated_at ON anotacoes_lead;
CREATE TRIGGER trigger_anotacoes_updated_at
    BEFORE UPDATE ON anotacoes_lead
    FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

-- ========================================
-- CRIAR EMPRESA PADRÃO E MIGRAR DADOS
-- ========================================
DO $$
DECLARE
    v_empresa_id INTEGER;
    v_usuario_id INTEGER;
BEGIN
    -- Criar empresa padrão
    INSERT INTO empresas (nome, razao_social, email)
    VALUES ('Empresa Principal', 'Empresa Principal LTDA', 'contato@empresa.com')
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_empresa_id;

    -- Se não retornou (já existia), buscar o id
    IF v_empresa_id IS NULL THEN
        SELECT id INTO v_empresa_id FROM empresas WHERE nome = 'Empresa Principal' LIMIT 1;
    END IF;

    -- Se ainda não temos empresa, criar uma nova
    IF v_empresa_id IS NULL THEN
        INSERT INTO empresas (nome, razao_social, email)
        VALUES ('Empresa Principal', 'Empresa Principal LTDA', 'contato@empresa.com')
        RETURNING id INTO v_empresa_id;
    END IF;

    RAISE NOTICE 'Empresa ID criada/encontrada: %', v_empresa_id;

    -- Atualizar usuário master@gestao.com
    UPDATE usuarios
    SET empresa_id = v_empresa_id, tipo_usuario = 'master'
    WHERE email = 'master@gestao.com';

    -- Atualizar todos os usuários sem empresa
    UPDATE usuarios
    SET empresa_id = v_empresa_id
    WHERE empresa_id IS NULL;

    -- Atualizar funis sem empresa_id (pegar do usuario_id)
    UPDATE funis f
    SET empresa_id = (SELECT empresa_id FROM usuarios u WHERE u.id = f.usuario_id)
    WHERE f.empresa_id IS NULL;

    -- Atualizar contatos_whatsapp
    UPDATE contatos_whatsapp cw
    SET empresa_id = (SELECT empresa_id FROM usuarios u WHERE u.id = cw.usuario_id)
    WHERE cw.empresa_id IS NULL;

    -- Atualizar leads (empresa_id e responsavel_id)
    UPDATE leads l
    SET
        empresa_id = (SELECT empresa_id FROM usuarios u WHERE u.id = l.usuario_id),
        responsavel_id = l.usuario_id
    WHERE l.empresa_id IS NULL;

    -- Atualizar tags
    UPDATE tags t
    SET empresa_id = (SELECT empresa_id FROM usuarios u WHERE u.id = t.usuario_id)
    WHERE t.empresa_id IS NULL;

    -- Atualizar mensagens_templates
    UPDATE mensagens_templates mt
    SET empresa_id = (SELECT empresa_id FROM usuarios u WHERE u.id = mt.usuario_id)
    WHERE mt.empresa_id IS NULL;

    -- Atualizar historico_mensagens
    UPDATE historico_mensagens hm
    SET empresa_id = (SELECT empresa_id FROM usuarios u WHERE u.id = hm.usuario_id)
    WHERE hm.empresa_id IS NULL;

    -- Atualizar atividades_lead
    UPDATE atividades_lead al
    SET empresa_id = (SELECT empresa_id FROM leads l WHERE l.id = al.lead_id)
    WHERE al.empresa_id IS NULL;

    RAISE NOTICE 'Migração de dados concluída!';
END $$;

-- ========================================
-- ATUALIZAR VIEW: leads_kanban
-- ========================================
DROP VIEW IF EXISTS leads_kanban;
CREATE OR REPLACE VIEW leads_kanban AS
SELECT
    l.id,
    l.usuario_id,
    l.empresa_id,
    l.responsavel_id,
    l.funil_id,
    l.estagio_id,
    l.contato_whatsapp_id,
    l.nome,
    l.telefone,
    l.email,
    l.empresa AS lead_empresa,
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
    cw.numero AS whatsapp_numero,
    u.nome AS responsavel_nome,
    -- Próxima tarefa
    (SELECT json_build_object(
        'id', t.id,
        'titulo', t.titulo,
        'tipo', t.tipo,
        'data_vencimento', t.data_vencimento,
        'status', t.status
    ) FROM tarefas_lead t
    WHERE t.lead_id = l.id AND t.status IN ('pendente', 'em_andamento')
    ORDER BY t.data_vencimento ASC LIMIT 1) AS proxima_tarefa,
    -- Total de tarefas pendentes
    (SELECT COUNT(*) FROM tarefas_lead t
    WHERE t.lead_id = l.id AND t.status IN ('pendente', 'em_andamento')) AS total_tarefas_pendentes,
    -- Total de anotações
    (SELECT COUNT(*) FROM anotacoes_lead a WHERE a.lead_id = l.id) AS total_anotacoes
FROM leads l
JOIN estagios_funil e ON l.estagio_id = e.id
LEFT JOIN contatos_whatsapp cw ON l.contato_whatsapp_id = cw.id
LEFT JOIN usuarios u ON l.responsavel_id = u.id;

-- ========================================
-- FUNÇÃO: criar_funil_padrao_empresa
-- ========================================
CREATE OR REPLACE FUNCTION criar_funil_padrao_empresa(p_empresa_id INTEGER, p_usuario_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
    v_funil_id INTEGER;
BEGIN
    -- Verificar se já existe funil padrão para a empresa
    SELECT id INTO v_funil_id FROM funis
    WHERE empresa_id = p_empresa_id AND padrao = true;

    IF v_funil_id IS NOT NULL THEN
        RETURN v_funil_id;
    END IF;

    -- Criar funil
    INSERT INTO funis (usuario_id, empresa_id, nome, descricao, padrao)
    VALUES (p_usuario_id, p_empresa_id, 'Funil Principal', 'Funil padrão de vendas', true)
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
-- COMENTÁRIOS
-- ========================================
COMMENT ON TABLE empresas IS 'Empresas - Tenant principal do sistema multi-tenancy';
COMMENT ON TABLE tarefas_lead IS 'Tarefas agendadas para leads (reunião, ligação, etc)';
COMMENT ON TABLE anotacoes_lead IS 'Histórico de anotações/notas dos leads';
COMMENT ON COLUMN usuarios.empresa_id IS 'Empresa à qual o usuário pertence';
COMMENT ON COLUMN usuarios.tipo_usuario IS 'Tipo: master (acesso total) ou comum (acesso limitado)';
COMMENT ON COLUMN leads.responsavel_id IS 'Usuário responsável pelo lead';
COMMENT ON COLUMN leads.empresa_id IS 'Empresa dona do lead (multi-tenancy)';
