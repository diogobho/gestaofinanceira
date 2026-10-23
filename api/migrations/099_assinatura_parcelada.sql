-- 099 — Assinatura parcelada no cartão (05/10/2026)
-- O Asaas não parcela assinatura recorrente: o ciclo semestral/anual pago em parcelas
-- vira um PARCELAMENTO (POST /payments com installmentCount), sem renovação automática.
-- Rodar como postgres (dono de `assinaturas`).
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS asaas_installment_id VARCHAR(64);
ALTER TABLE assinaturas ADD COLUMN IF NOT EXISTS parcelas INTEGER;
CREATE INDEX IF NOT EXISTS idx_assinaturas_installment ON assinaturas (asaas_installment_id) WHERE asaas_installment_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON assinaturas TO gestao_user;
