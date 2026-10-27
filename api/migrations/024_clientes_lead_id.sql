-- Migration 024: Adiciona lead_id em clientes para rastrear origem do CRM
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_lead_id ON clientes(lead_id);
