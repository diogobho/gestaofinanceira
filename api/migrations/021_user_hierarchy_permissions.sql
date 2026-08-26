-- ============================================
-- Migration: 021_user_hierarchy_permissions.sql
-- Descrição: Reconcilia hierarquia de usuários (Admin/Master/Comum)
--            e adiciona sistema de permissões
-- Hierarquia:
--   Admin (super_admin) → cria Master, acesso total
--   Master (usuario + tipo_usuario='master') → cria Comum, admin da empresa
--   Comum (usuario + tipo_usuario='comum') → acesso operacional por permissões
-- Data: 2026-01-27
-- ============================================

-- ========================================
-- 1. Adicionar coluna de permissões
-- ========================================
ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS permissoes JSONB DEFAULT '{
  "dashboard": true,
  "crm": true,
  "clientes": true,
  "receitas": true,
  "despesas": true,
  "parcelas": true,
  "sessoes": true,
  "whatsapp": true,
  "relatorios": true
}';

-- ========================================
-- 2. Reconciliar nivel admin_empresa → master
-- ========================================
UPDATE usuarios
SET nivel = 'usuario', tipo_usuario = 'master'
WHERE nivel = 'admin_empresa';

-- ========================================
-- 3. Garantir que super_admin tenha tipo_usuario master
-- ========================================
UPDATE usuarios
SET tipo_usuario = 'master'
WHERE nivel = 'super_admin';

-- ========================================
-- 4. Garantir permissões completas para master
-- ========================================
UPDATE usuarios
SET permissoes = '{
  "dashboard": true,
  "crm": true,
  "clientes": true,
  "receitas": true,
  "despesas": true,
  "parcelas": true,
  "sessoes": true,
  "whatsapp": true,
  "relatorios": true
}'
WHERE tipo_usuario = 'master' OR nivel = 'super_admin';

-- ========================================
-- 5. Garantir todos os usuarios tenham empresa_id
-- ========================================
DO $$
DECLARE
    v_empresa_id INTEGER;
BEGIN
    -- Buscar empresa padrão
    SELECT id INTO v_empresa_id FROM empresas WHERE nome = 'Empresa Principal' LIMIT 1;

    -- Se não existe, criar
    IF v_empresa_id IS NULL THEN
        INSERT INTO empresas (nome, razao_social, email)
        VALUES ('Empresa Principal', 'Empresa Principal LTDA', 'contato@empresa.com')
        RETURNING id INTO v_empresa_id;
    END IF;

    -- Atribuir empresa a usuarios sem empresa (exceto super_admin que pode não ter)
    UPDATE usuarios
    SET empresa_id = v_empresa_id
    WHERE empresa_id IS NULL AND nivel != 'super_admin';

    RAISE NOTICE 'Hierarquia reconciliada. Empresa padrão ID: %', v_empresa_id;
END $$;

-- ========================================
-- 6. Índice para permissões
-- ========================================
CREATE INDEX IF NOT EXISTS idx_usuarios_tipo_usuario ON usuarios(tipo_usuario);

-- ========================================
-- 7. Atualizar VIEW leads_kanban com responsavel
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
    l.mensagens_nao_lidas,
    l.aguardando_resposta,
    l.ultima_resposta_cliente_at,
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
-- COMENTÁRIOS
-- ========================================
COMMENT ON COLUMN usuarios.permissoes IS 'Permissões do usuário (JSONB). Master tem todas. Comum tem permissões definidas pelo Master.';
