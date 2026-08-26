-- Migration 027: Modo proativo do agente IA
ALTER TABLE agente_ia_config ADD COLUMN IF NOT EXISTS proativo_ativo BOOLEAN DEFAULT false;
ALTER TABLE agente_ia_config ADD COLUMN IF NOT EXISTS horario_proativo VARCHAR(5) DEFAULT '09:00';
ALTER TABLE agente_ia_config ADD COLUMN IF NOT EXISTS min_horas_silencio INTEGER DEFAULT 4;
