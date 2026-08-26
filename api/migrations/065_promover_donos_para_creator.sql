-- 065 — Promove o dono de cada empresa a creator (roda DEPOIS da 064)
--
-- Com o creator sendo o único a configurar o agente de IA, os masters perdem esse
-- acesso. Sem esta promoção, TODA empresa ficaria sem ninguém capaz de mexer no
-- prompt do próprio agente — é regressão, não é o objetivo da mudança.
--
-- Dono = o master mais antigo da empresa (a conta criada junto com a empresa).
-- O super_admin do sistema fica de fora: o acesso dele vem de `nivel`, não do tipo,
-- e rebaixá-lo/promovê-lo aqui não muda nada além de confundir a leitura da tabela.

UPDATE usuarios u
   SET tipo_usuario = 'creator'
  FROM (
    SELECT DISTINCT ON (empresa_id) id
      FROM usuarios
     WHERE tipo_usuario = 'master'
       AND nivel <> 'super_admin'
       AND empresa_id IS NOT NULL
     ORDER BY empresa_id, created_at ASC, id ASC
  ) dono
 WHERE u.id = dono.id;
