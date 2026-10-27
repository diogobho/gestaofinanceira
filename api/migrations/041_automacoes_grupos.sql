-- Migration 041: Automações para grupos WhatsApp
-- Permite criar mensagens automáticas disparadas quando um novo participante entra no grupo

CREATE TABLE IF NOT EXISTS automacoes_grupo (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

    nome VARCHAR(200) NOT NULL,
    grupo_whatsapp_id VARCHAR(100) NOT NULL,
    grupo_nome VARCHAR(255),

    mensagem TEXT NOT NULL,
    ativa BOOLEAN NOT NULL DEFAULT true,

    trigger_tipo VARCHAR(30) NOT NULL DEFAULT 'novo_participante',

    delay_segundos INTEGER NOT NULL DEFAULT 30,

    enviar_para VARCHAR(20) NOT NULL DEFAULT 'dm_participante',

    total_disparos INTEGER NOT NULL DEFAULT 0,
    ultimo_disparo_at TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT automacoes_grupo_delay_valido CHECK (delay_segundos >= 0 AND delay_segundos <= 3600),
    CONSTRAINT automacoes_grupo_enviar_para_valido CHECK (enviar_para IN ('dm_participante', 'grupo'))
);

CREATE INDEX IF NOT EXISTS idx_automacoes_grupo_empresa ON automacoes_grupo(empresa_id);
CREATE INDEX IF NOT EXISTS idx_automacoes_grupo_grupo_id ON automacoes_grupo(grupo_whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_automacoes_grupo_ativa ON automacoes_grupo(ativa) WHERE ativa = true;

-- Tabela de histórico de disparos (auditoria)
CREATE TABLE IF NOT EXISTS automacoes_grupo_historico (
    id SERIAL PRIMARY KEY,
    automacao_id INTEGER NOT NULL REFERENCES automacoes_grupo(id) ON DELETE CASCADE,
    participante_numero VARCHAR(50) NOT NULL,
    participante_nome VARCHAR(200),
    mensagem_enviada TEXT NOT NULL,
    sucesso BOOLEAN NOT NULL DEFAULT false,
    erro TEXT,
    enviado_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_automacoes_hist_automacao ON automacoes_grupo_historico(automacao_id);
CREATE INDEX IF NOT EXISTS idx_automacoes_hist_participante ON automacoes_grupo_historico(participante_numero);

COMMENT ON TABLE automacoes_grupo IS 'Automações de mensagem para grupos WhatsApp (disparadas quando novo participante entra)';
COMMENT ON COLUMN automacoes_grupo.trigger_tipo IS 'Tipo de gatilho: novo_participante (único suportado inicialmente)';
COMMENT ON COLUMN automacoes_grupo.enviar_para IS 'dm_participante = envia DM para o novo membro | grupo = envia no grupo';
COMMENT ON COLUMN automacoes_grupo.delay_segundos IS 'Atraso em segundos antes do envio (evitar aparência de bot)';
