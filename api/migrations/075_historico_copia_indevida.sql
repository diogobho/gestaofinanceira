-- 075 — A conversa é da empresa cujo chip carregou a mensagem, e só dela.
--
-- Até 19/08/2026 o webhook de mensagem achava o contato só pelo número e gravava a
-- mesma mensagem em TODA empresa que tivesse aquele número salvo: conversa da
-- Panteras aparecia no CRM da DuoFuturo, e conversa pessoal do Diogo aparecia nos
-- contatos da Panteras e da master@. A leitura sempre foi por empresa — o que
-- vazou foi a GRAVAÇÃO, uma linha por empresa.
--
-- Decisão de 15/09/2026: separar, não apagar. A cópia fica no banco, marcada, e
-- nenhuma tela, contagem ou contexto do agente a enxerga. Desfazer é um UPDATE.
--
-- Quem é cópia foi decidido por evidência, não por palpite: o log de cada instância
-- registra, segundo a segundo, a mensagem 1:1 que ela recebeu ou enviou. Cópia é a
-- linha gravada numa empresa cujo chip estava no ar e NÃO carregou a mensagem.
-- Conversa entre dois chips nossos (as duas pontas são legítimas) e os casos sem
-- prova ficam como estão. Script: api/scripts/marcar_copias_indevidas_20260915.js.

ALTER TABLE historico_mensagens
  ADD COLUMN IF NOT EXISTS copia_indevida boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN historico_mensagens.copia_indevida IS
  'Mensagem gravada numa empresa cujo chip não a carregou (vazamento até 19/08/2026). Fica no banco, fora de toda leitura.';

-- A view de contatos sem lead contava as cópias como conversa do contato.
CREATE OR REPLACE VIEW contatos_nao_convertidos AS
 SELECT id, usuario_id, whatsapp_id, numero, nome, nome_push, foto_url, is_grupo,
        ultima_mensagem, ultima_mensagem_at, sincronizado_at, created_at, updated_at,
        empresa_id,
        (SELECT count(*) FROM historico_mensagens hm
          WHERE hm.contato_whatsapp_id = cw.id AND NOT hm.copia_indevida) AS total_mensagens
   FROM contatos_whatsapp cw
  WHERE is_grupo = false
    AND NOT (id IN (SELECT leads.contato_whatsapp_id FROM leads
                     WHERE leads.contato_whatsapp_id IS NOT NULL));
