-- 113 (23/10/2026): a indicação deixa de pagar 20% em dinheiro (111) e passa a render
-- R$ 20 de crédito por indicada que assinar, depois do pagamento confirmado no Asaas
-- (decisão do dono). Quem indicou escolhe o destino de cada recompensa:
--   credito_duo        → entra como saldo do Duo (uso da IA), em duo_creditos_mov 'indicacao'
--   desconto_pendente  → será abatido na próxima cobrança da assinatura no Asaas
--   descontado         → já abatido (desconto_payment_id = a cobrança que levou o abatimento)
-- 'disponivel' = ainda sem escolha. A tabela segue com o nome de 111; nenhuma linha existia.
--
-- Rodar como postgres:
--   sudo -u postgres psql -d gestao_financeira -v ON_ERROR_STOP=1 -f migrations/113_afiliado_recompensa_credito.sql
ALTER TABLE afiliado_comissoes DROP CONSTRAINT IF EXISTS afiliado_comissoes_status_check;
UPDATE afiliado_comissoes SET status = 'disponivel' WHERE status = 'a_pagar';
ALTER TABLE afiliado_comissoes ALTER COLUMN status SET DEFAULT 'disponivel';
ALTER TABLE afiliado_comissoes ADD CONSTRAINT afiliado_comissoes_status_check
  CHECK (status IN ('disponivel', 'credito_duo', 'desconto_pendente', 'descontado', 'cancelada'));
ALTER TABLE afiliado_comissoes ALTER COLUMN percentual DROP NOT NULL;
ALTER TABLE afiliado_comissoes ADD COLUMN IF NOT EXISTS escolhido_em timestamptz;
ALTER TABLE afiliado_comissoes ADD COLUMN IF NOT EXISTS desconto_payment_id varchar(60);

ALTER TABLE duo_creditos_mov DROP CONSTRAINT IF EXISTS duo_creditos_mov_tipo_check;
ALTER TABLE duo_creditos_mov ADD CONSTRAINT duo_creditos_mov_tipo_check
  CHECK (tipo IN ('teste', 'compra', 'consumo', 'ajuste', 'indicacao'));
