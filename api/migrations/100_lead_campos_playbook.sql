-- 100: campos do card que os modelos do playbook usam nas variáveis (06/10/2026).
-- O vendedor preenche com as palavras do lead: negócio ("confeitaria"), objetivo e desafio
-- com verbo no infinitivo ("faturar 15 mil por mês", "organizar o caixa") e o tema da dúvida
-- ("o valor"). Vazio = o modelo que depende do campo não sai (despacho.ts).
-- Rodar como postgres (dono de leads).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS negocio  VARCHAR(120);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS objetivo VARCHAR(160);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS desafio  VARCHAR(160);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS duvida   VARCHAR(120);
