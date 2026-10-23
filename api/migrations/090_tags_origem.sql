-- 090 — Tags de origem da Panteras (30/09/2026)
--
-- Registro de cada par (lead, tag) que `crm/tags/tags-origem.ts` já aplicou uma vez.
-- É o que impede o job de devolver ao card uma tag que o operador tirou à mão.
--
-- Sem FK de propósito: `leads` e `tags` são do postgres e o gestao_user não tem
-- REFERENCES nelas. Linha de lead ou tag excluídos fica órfã e não atrapalha nada.
-- Roda como o usuário da API.

CREATE TABLE IF NOT EXISTS lead_tags_origem (
  lead_id     INTEGER   NOT NULL,
  tag_id      INTEGER   NOT NULL,
  aplicada_em TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lead_id, tag_id)
);
