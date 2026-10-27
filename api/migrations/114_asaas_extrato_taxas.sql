-- 114: taxas do Asaas pelo EXTRATO (26/10/2026). Até aqui a taxa era `value - netValue` da
-- cobrança paga, o que deixava de fora tudo o que o Asaas cobra à parte: notificação por
-- WhatsApp, mensageria, nota fiscal, antecipação, negativação — e a taxa de cartão, que sai na
-- confirmação e não no vencimento de cada parcela. Graciele (empresa 39): 10 taxas no Duo contra
-- 109 no extrato desde 07/10. Agora cada lançamento de taxa do extrato vira uma despesa.
-- Linha do extrato ↔ despesa. A linha fica mesmo se a despesa for apagada à mão: não volta.
CREATE TABLE IF NOT EXISTS asaas_extrato (
  conexao_id    INTEGER NOT NULL,
  transacao_id  VARCHAR(40) NOT NULL,
  tipo          VARCHAR(60) NOT NULL,
  payment_id    VARCHAR(40),
  valor         NUMERIC(12,2) NOT NULL,                 -- como no extrato: taxa negativa, estorno positivo
  data          DATE NOT NULL,
  despesa_id    UUID,                                   -- null no estorno de taxa
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conexao_id, transacao_id)
);
CREATE INDEX IF NOT EXISTS asaas_extrato_despesa ON asaas_extrato (despesa_id);

-- Até que dia o extrato já foi lido; a próxima leitura recomeça uma semana antes.
ALTER TABLE asaas_conexoes ADD COLUMN IF NOT EXISTS extrato_ate DATE;
