-- Migration 059: unicidade de funil por empresa + nome + TIPO (antes era usuario + nome)
--
-- A constraint antiga unique_funil_nome_usuario (usuario_id, nome) estava errada
-- em dois pontos:
--   1. Escopo por USUÁRIO — mas funis são compartilhados/gerenciados por EMPRESA
--      (list/getById/update/delete filtram por empresa_id). Isso permitia funis
--      duplicados na mesma empresa (criados por usuários diferentes) e bloqueava
--      recriação legítima quando o "dono" (usuario_id) mudava.
--   2. Ignorava o TIPO — impedia ter um funil "X" de aquisição (CRM/funil) e outro
--      "X" de CX (CRM CX), que são pipelines distintos e independentes. Era esse o
--      caso do "Leadership Club": já existia como CX e não podia ser criado como
--      aquisição.
--
-- Nova regra: a duplicidade só vale dentro do MESMO tipo de funil da empresa.
-- Constraint: unique_funil_empresa_nome_tipo (empresa_id, nome, tipo).
--
-- Pré-checado: nenhuma linha viola (empresa_id, nome, tipo) e não há empresa_id NULL.

BEGIN;

ALTER TABLE funis DROP CONSTRAINT IF EXISTS unique_funil_nome_usuario;

ALTER TABLE funis
  ADD CONSTRAINT unique_funil_empresa_nome_tipo UNIQUE (empresa_id, nome, tipo);

COMMIT;
