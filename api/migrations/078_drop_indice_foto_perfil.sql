-- Migration 078: remover o índice btree sobre usuarios.foto_perfil
-- Data: 2026-09-18
-- Motivo: a coluna guarda a foto em base64 (data URL). O btree aceita ~2,7 KB por
-- entrada, então QUALQUER foto real fazia o UPDATE falhar com
--   "index row requires N bytes, maximum size is 8191"
-- Efeito prático: a foto de perfil nunca funcionou para ninguém desde a migration
-- 013 (nov/2025) — zero usuários com foto_perfil preenchido em toda a base.
-- Chamado #109 (Cleice Freitas, Instituto Magnolia, 16/09/2026).
--
-- O índice não serve para nada: ninguém consulta usuário por foto.
-- Roda como postgres (dono da tabela usuarios).

DROP INDEX IF EXISTS idx_usuarios_foto_perfil;
