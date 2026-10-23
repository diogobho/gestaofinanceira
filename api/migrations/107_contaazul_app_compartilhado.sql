-- 107 (09/10/2026): conectar o Conta Azul pela tela, como o Asaas. Todas as empresas autorizam
-- o MESMO aplicativo do Duo (CONTAAZUL_CLIENT_ID/SECRET do .env): o refresh_token é de cada
-- conta, o client é um só. O índice único em client_id vinha da 066, quando cada conta tinha o
-- seu próprio app — agora impediria a segunda conexão.
-- Rodar como postgres (dono de contaazul_conexoes):
--   sudo -u postgres psql -d gestao_financeira -v ON_ERROR_STOP=1 -f migrations/107_contaazul_app_compartilhado.sql
DROP INDEX IF EXISTS contaazul_conexoes_client_id;
