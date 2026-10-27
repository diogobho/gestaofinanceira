-- Migration 043: Sistema unificado de Automações
-- Cria estrutura única para todos os tipos de automação do sistema:
--  - mensagem em grupo WhatsApp (legacy: automacoes_grupo)
--  - follow-ups (legacy: estagios_funil.followup_config + followups_agendados)
--  - ativação de agente IA por estágio (legacy: estagios_funil.agente_ia_ativo)
--  - ativação de agente IA por lead (legacy: leads.agente_ia_ativo)
--  - disparos em massa (vínculo opcional com disparos_crm)

BEGIN;

-- ============================================================================
-- Tabela principal: automacoes
-- ============================================================================
CREATE TABLE IF NOT EXISTS automacoes (
    id              SERIAL PRIMARY KEY,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

    nome            VARCHAR(200) NOT NULL,
    descricao       TEXT,

    -- Tipo de ação que a automação executa
    tipo_acao       VARCHAR(40) NOT NULL,

    -- Contexto: FKs nullable + CHECK garante exatamente UMA preenchida
    grupo_whatsapp_id VARCHAR(100),
    funil_id          INTEGER REFERENCES funis(id) ON DELETE CASCADE,
    estagio_id        INTEGER REFERENCES estagios_funil(id) ON DELETE CASCADE,
    lead_id           INTEGER REFERENCES leads(id) ON DELETE CASCADE,

    -- Estado e configuração
    ativa           BOOLEAN NOT NULL DEFAULT true,
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Métricas/tracking
    total_execucoes INTEGER NOT NULL DEFAULT 0,
    ultima_execucao_at TIMESTAMP,

    -- Vínculo opcional com legacy
    automacao_grupo_id INTEGER REFERENCES automacoes_grupo(id) ON DELETE SET NULL,

    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT automacoes_tipo_valido CHECK (
        tipo_acao IN (
            'envio_mensagem_grupo',
            'followup',
            'ativar_agente_estagio',
            'ativar_agente_lead',
            'disparo_lote'
        )
    ),
    CONSTRAINT automacoes_contexto_unico CHECK (
        (
            (grupo_whatsapp_id IS NOT NULL)::int
          + (funil_id IS NOT NULL)::int
          + (estagio_id IS NOT NULL)::int
          + (lead_id IS NOT NULL)::int
        ) = 1
    )
);

CREATE INDEX IF NOT EXISTS idx_automacoes_empresa
    ON automacoes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_automacoes_ativa
    ON automacoes(empresa_id, ativa) WHERE ativa = true;
CREATE INDEX IF NOT EXISTS idx_automacoes_tipo
    ON automacoes(empresa_id, tipo_acao);
CREATE INDEX IF NOT EXISTS idx_automacoes_funil
    ON automacoes(funil_id) WHERE funil_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automacoes_estagio
    ON automacoes(estagio_id) WHERE estagio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automacoes_lead
    ON automacoes(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automacoes_grupo_wpp
    ON automacoes(grupo_whatsapp_id) WHERE grupo_whatsapp_id IS NOT NULL;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION trg_automacoes_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS automacoes_set_updated_at ON automacoes;
CREATE TRIGGER automacoes_set_updated_at
    BEFORE UPDATE ON automacoes
    FOR EACH ROW EXECUTE FUNCTION trg_automacoes_set_updated_at();

-- ============================================================================
-- Tabela de execuções (auditoria/histórico unificado)
-- ============================================================================
CREATE TABLE IF NOT EXISTS automacoes_execucoes (
    id              SERIAL PRIMARY KEY,
    automacao_id    INTEGER NOT NULL REFERENCES automacoes(id) ON DELETE CASCADE,
    empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,

    -- Alvo da execução (lead/contato/grupo)
    lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    alvo_externo    VARCHAR(255),

    status          VARCHAR(20) NOT NULL DEFAULT 'sucesso',
    erro            TEXT,
    dados           JSONB,

    executada_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT automacoes_execucoes_status_valido CHECK (
        status IN ('sucesso', 'falhou', 'pendente', 'cancelado')
    )
);

CREATE INDEX IF NOT EXISTS idx_automacoes_execucoes_automacao
    ON automacoes_execucoes(automacao_id, executada_at DESC);
CREATE INDEX IF NOT EXISTS idx_automacoes_execucoes_empresa
    ON automacoes_execucoes(empresa_id, executada_at DESC);
CREATE INDEX IF NOT EXISTS idx_automacoes_execucoes_lead
    ON automacoes_execucoes(lead_id) WHERE lead_id IS NOT NULL;

-- ============================================================================
-- VIEW unificada para listagem rápida no dashboard
-- ============================================================================
CREATE OR REPLACE VIEW vw_automacoes_dashboard AS
SELECT
    a.id,
    a.empresa_id,
    a.usuario_id,
    a.nome,
    a.descricao,
    a.tipo_acao,
    a.ativa,
    a.config,
    a.total_execucoes,
    a.ultima_execucao_at,
    a.created_at,
    a.updated_at,

    a.grupo_whatsapp_id,
    a.funil_id,
    a.estagio_id,
    a.lead_id,

    -- Resolução de nomes do contexto
    f.nome AS funil_nome,
    f.tipo AS funil_tipo,
    e.nome AS estagio_nome,
    e.cor  AS estagio_cor,
    l.nome AS lead_nome,

    CASE
        WHEN a.grupo_whatsapp_id IS NOT NULL THEN 'grupo_whatsapp'
        WHEN a.lead_id           IS NOT NULL THEN 'lead'
        WHEN a.estagio_id        IS NOT NULL THEN 'estagio'
        WHEN a.funil_id          IS NOT NULL THEN 'funil'
    END AS contexto_tipo
FROM automacoes a
LEFT JOIN funis           f ON f.id = COALESCE(a.funil_id,
                                               (SELECT funil_id FROM estagios_funil WHERE id = a.estagio_id),
                                               (SELECT funil_id FROM leads WHERE id = a.lead_id))
LEFT JOIN estagios_funil  e ON e.id = COALESCE(a.estagio_id,
                                               (SELECT estagio_id FROM leads WHERE id = a.lead_id))
LEFT JOIN leads           l ON l.id = a.lead_id;

COMMIT;
