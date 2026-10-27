-- Migration 055: Catálogo gerenciável de origens de lead
--
-- Antes: `leads.origem` era texto livre e a lista de origens no frontend era
-- fixa (hardcoded). Não dava para criar/renomear/apagar origens.
--
-- Agora: cada empresa tem um catálogo de origens em `crm_origens`. O usuário
-- pode criar, renomear (cascata em leads.origem) e apagar (leads.origem → NULL).
-- `leads.origem` continua sendo texto (casado por nome) — sem FK, para não
-- reescrever todo o schema/consultas existentes que já usam a string.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_origens (
  id         SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome       VARCHAR(120) NOT NULL,
  cor        VARCHAR(9),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_crm_origens_empresa ON crm_origens(empresa_id);

-- Semear com as origens que já existem em leads (por empresa).
INSERT INTO crm_origens (empresa_id, nome)
SELECT DISTINCT empresa_id, origem
FROM leads
WHERE origem IS NOT NULL AND btrim(origem) <> ''
ON CONFLICT (empresa_id, nome) DO NOTHING;

-- Garantir as origens padrão para toda empresa que já tem leads.
INSERT INTO crm_origens (empresa_id, nome)
SELECT e.empresa_id, d.nome
FROM (SELECT DISTINCT empresa_id FROM leads) e
CROSS JOIN (VALUES
  ('manual'), ('indicacao'), ('networking'), ('parceria'),
  ('instagram'), ('lancamento'), ('forms'), ('whatsapp'), ('importacao')
) AS d(nome)
ON CONFLICT (empresa_id, nome) DO NOTHING;

COMMIT;
