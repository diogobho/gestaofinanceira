-- Migration 044: Popular tabela `automacoes` a partir das fontes existentes
-- Idempotente: usa NOT EXISTS pra não duplicar se rodar de novo

BEGIN;

-- 1) Mensagens em grupo WhatsApp (legacy automacoes_grupo)
INSERT INTO automacoes (
    empresa_id, usuario_id, nome, descricao,
    tipo_acao, grupo_whatsapp_id, ativa, config,
    total_execucoes, ultima_execucao_at,
    automacao_grupo_id, created_at, updated_at
)
SELECT
    ag.empresa_id, ag.usuario_id, ag.nome, NULL,
    'envio_mensagem_grupo', ag.grupo_whatsapp_id, ag.ativa,
    jsonb_build_object(
        'mensagem', ag.mensagem,
        'grupo_nome', ag.grupo_nome,
        'trigger_tipo', ag.trigger_tipo,
        'delay_segundos', ag.delay_segundos,
        'enviar_para', ag.enviar_para
    ),
    ag.total_disparos, ag.ultimo_disparo_at,
    ag.id, ag.created_at, ag.updated_at
FROM automacoes_grupo ag
WHERE NOT EXISTS (
    SELECT 1 FROM automacoes a WHERE a.automacao_grupo_id = ag.id
);

-- 2) Agente IA ativado por estágio (estagios_funil.agente_ia_ativo = true)
INSERT INTO automacoes (
    empresa_id, usuario_id, nome, descricao,
    tipo_acao, estagio_id, ativa, config,
    created_at, updated_at
)
SELECT
    f.empresa_id,
    f.usuario_id,
    'Agente IA — ' || ef.nome,
    'Agente IA ativo para leads neste estágio',
    'ativar_agente_estagio',
    ef.id,
    true,
    jsonb_build_object(
        'instrucoes', COALESCE(ef.instrucoes_agente_ia, ''),
        'estagio_apos_resposta_id', ef.estagio_apos_resposta_id
    ),
    COALESCE(ef.created_at, CURRENT_TIMESTAMP),
    COALESCE(ef.updated_at, CURRENT_TIMESTAMP)
FROM estagios_funil ef
JOIN funis f ON f.id = ef.funil_id
WHERE ef.agente_ia_ativo = true
  AND f.empresa_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM automacoes a
      WHERE a.estagio_id = ef.id
        AND a.tipo_acao  = 'ativar_agente_estagio'
  );

-- 3) Follow-up configurado por estágio (estagios_funil.followup_config NOT NULL)
INSERT INTO automacoes (
    empresa_id, usuario_id, nome, descricao,
    tipo_acao, estagio_id, ativa, config,
    created_at, updated_at
)
SELECT
    f.empresa_id,
    f.usuario_id,
    'Follow-up — ' || ef.nome,
    'Follow-up automático configurado para este estágio',
    'followup',
    ef.id,
    COALESCE((ef.followup_config->>'ativo')::boolean, true),
    ef.followup_config,
    COALESCE(ef.created_at, CURRENT_TIMESTAMP),
    COALESCE(ef.updated_at, CURRENT_TIMESTAMP)
FROM estagios_funil ef
JOIN funis f ON f.id = ef.funil_id
WHERE ef.followup_config IS NOT NULL
  AND f.empresa_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM automacoes a
      WHERE a.estagio_id = ef.id
        AND a.tipo_acao  = 'followup'
  );

-- 4) Agente IA ativado por lead (override individual)
-- Insere apenas overrides verdadeiros (não NULL).
-- Tanto `true` quanto `false` viram automação, com `ativa` espelhando.
INSERT INTO automacoes (
    empresa_id, usuario_id, nome, descricao,
    tipo_acao, lead_id, ativa, config,
    created_at, updated_at
)
SELECT
    l.empresa_id,
    l.usuario_id,
    'Agente IA — Lead ' || l.nome,
    'Override individual do agente IA para este lead',
    'ativar_agente_lead',
    l.id,
    l.agente_ia_ativo,
    jsonb_build_object('override_estagio', true),
    COALESCE(l.created_at, CURRENT_TIMESTAMP),
    COALESCE(l.updated_at, CURRENT_TIMESTAMP)
FROM leads l
WHERE l.agente_ia_ativo IS NOT NULL
  AND l.empresa_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM automacoes a
      WHERE a.lead_id  = l.id
        AND a.tipo_acao = 'ativar_agente_lead'
  );

COMMIT;
