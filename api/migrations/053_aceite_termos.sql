-- Migration 053: Registro do aceite de Termos de Uso / Política de Privacidade (LGPD)
--
-- Guarda a comprovação do consentimento do titular da conta no momento do cadastro:
-- versão aceita, data/hora e IP de origem. Serve de evidência para a LGPD.

BEGIN;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS aceite_termos_versao VARCHAR(20),
  ADD COLUMN IF NOT EXISTS aceite_termos_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS aceite_termos_ip     VARCHAR(45);

COMMENT ON COLUMN usuarios.aceite_termos_versao IS 'Versão dos Termos/Política aceita no cadastro';
COMMENT ON COLUMN usuarios.aceite_termos_em     IS 'Data/hora do aceite';
COMMENT ON COLUMN usuarios.aceite_termos_ip     IS 'IP de origem do aceite (evidência LGPD)';

COMMIT;
