-- Migração 028: Adiciona 'diagnostico' como valor permitido em leads.origem
-- Para integração com o módulo Diagnóstico SaaS

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_origem_check;
ALTER TABLE leads ADD CONSTRAINT leads_origem_check
  CHECK (origem IN (
    'whatsapp','manual','importacao','indicacao',
    'networking','parceria','instagram','lancamento',
    'forms','diagnostico'
  ));
