-- 115: saídas do extrato do Asaas como despesa (26/10/2026), por conta — só quem pediu: a conta
-- do Asaas faz de banco para algumas empresas (Pix, cartão Asaas, contas pagas). Ligado para a
-- Graciele (39). Saída que bate com parcela lançada à mão (mesmo valor, até 3 dias) não duplica:
-- a parcela manual fica marcada como paga e ligada à linha do extrato.
ALTER TABLE asaas_conexoes ADD COLUMN IF NOT EXISTS importar_saidas BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE asaas_extrato ADD COLUMN IF NOT EXISTS ref VARCHAR(40);                -- transferId/billId: casa o estorno
ALTER TABLE asaas_extrato ADD COLUMN IF NOT EXISTS parcela_manual_id UUID;         -- saída que casou com lançamento manual
UPDATE asaas_conexoes SET importar_saidas = true WHERE empresa_id = 39;
UPDATE asaas_conexoes SET extrato_ate = NULL WHERE empresa_id = 39;   -- relê desde 07/10 para as saídas
