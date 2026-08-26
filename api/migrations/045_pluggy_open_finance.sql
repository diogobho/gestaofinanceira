-- Migration: 045_pluggy_open_finance.sql
-- Integração Open Finance via Pluggy
-- Aplicar: psql $DATABASE_URL -f api/migrations/045_pluggy_open_finance.sql

-- Tabela de conexões bancárias por usuário
CREATE TABLE IF NOT EXISTS conexoes_pluggy (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  pluggy_item_id VARCHAR(64) NOT NULL UNIQUE,
  instituicao    VARCHAR(120),
  status         VARCHAR(30) DEFAULT 'UPDATED',
  ultima_sync_em TIMESTAMP,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conexoes_pluggy_usuario_id ON conexoes_pluggy(usuario_id);
CREATE INDEX IF NOT EXISTS idx_conexoes_pluggy_item_id    ON conexoes_pluggy(pluggy_item_id);

CREATE OR REPLACE TRIGGER update_conexoes_pluggy_updated_at
  BEFORE UPDATE ON conexoes_pluggy
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Novas colunas em despesas (todas opcionais — retrocompatíveis, default seguro)
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS origem               VARCHAR(20) DEFAULT 'manual';
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS pluggy_transaction_id VARCHAR(64);
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS conexao_pluggy_id    UUID REFERENCES conexoes_pluggy(id) ON DELETE SET NULL;
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS instituicao          VARCHAR(120);
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS status_conciliacao   VARCHAR(20) DEFAULT 'ok';

-- Índices
CREATE INDEX IF NOT EXISTS idx_despesas_origem          ON despesas(origem);
CREATE INDEX IF NOT EXISTS idx_despesas_pluggy_tx_id    ON despesas(pluggy_transaction_id) WHERE pluggy_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_despesas_conexao_pluggy  ON despesas(conexao_pluggy_id)     WHERE conexao_pluggy_id IS NOT NULL;

-- Constraint de deduplicação (NULL não é considerado duplicata no PostgreSQL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'despesas_pluggy_transaction_id_unique'
  ) THEN
    ALTER TABLE despesas ADD CONSTRAINT despesas_pluggy_transaction_id_unique UNIQUE (pluggy_transaction_id);
  END IF;
END $$;
