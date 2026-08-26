-- Migration: 046_pluggy_importar_cartao.sql
-- Toggle por conexão: importar (ou não) transações de cartão de crédito
-- Aplicar: psql $DATABASE_URL -f api/migrations/046_pluggy_importar_cartao.sql

ALTER TABLE conexoes_pluggy
  ADD COLUMN IF NOT EXISTS importar_cartao BOOLEAN NOT NULL DEFAULT true;
