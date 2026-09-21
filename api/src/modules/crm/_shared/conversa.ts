/**
 * Estado da CONVERSA com o lead — fonte única de "não atropelar o lead".
 *
 * ── Por que isto existe ──────────────────────────────────────────────────────
 * Havia duas regras diferentes para a mesma pergunta, uma em cada caminho de
 * despacho, e a divergência quebrava a cadência:
 *
 *   - follow-up MANUAL (`despacho.ts`): adiava se o LEAD escreveu nos últimos 60min
 *     (`direcao = 'entrada'`). Correto.
 *   - follow-up de IA (`agente-ia.service.ts`): adiava se houve QUALQUER mensagem
 *     nos últimos 60min — inclusive as NOSSAS. Efeito prático: a interface propõe o
 *     passo seguinte da cadência em 10 MINUTOS (`passoNovo()`), e esse passo era
 *     empurrado 15 min por vez até completar 60 min do envio anterior. Um teto de
 *     "um toque por hora" que ninguém configurou, valendo só para o ramo de IA.
 *
 * ── A separação de responsabilidades ─────────────────────────────────────────
 * Quem decide QUANDO o follow-up sai é a CADÊNCIA (data/hora do passo). Quem impede
 * rajada no mesmo número é o ESPAÇAMENTO ANTI-BAN (por chip, em `motor.ts`). Quem
 * impede falar fora de hora é a JANELA OPERACIONAL. Este módulo responde a UMA
 * pergunta e só ela: **o lead acabou de falar?** — porque atropelar alguém que está
 * digitando é grosseria, não risco de bloqueio.
 *
 * Mensagem NOSSA nunca entra aqui. Se a cadência programou dois toques com 10 min de
 * diferença, é isso que o administrador quis.
 */

import { query } from '../../../config/database';

/**
 * Minutos de silêncio exigidos depois de uma fala do LEAD antes de um follow-up
 * automático entrar por cima. Se ele escreveu agora, a conversa está viva: quem
 * responde é o agente reativo, não o script agendado.
 */
export const SILENCIO_APOS_LEAD_MIN = 60;

/**
 * O LEAD escreveu nos últimos `SILENCIO_APOS_LEAD_MIN` minutos?
 *
 * Checa por CONTATO, não só por lead: um contato pode ter leads em mais de um funil e
 * o webhook grava a entrada em apenas um deles — olhar só `lead_id` perdia metade da
 * conversa. `grupo_whatsapp_id IS NULL` porque fala em grupo não é resposta para nós:
 * sem esse filtro, contato ativo num grupo empurrava o follow-up para sempre.
 */
export async function leadFalouRecentemente(
  leadId: number,
  contatoWhatsappId?: number | null
): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM historico_mensagens
      WHERE (lead_id = $1 OR ($2::int IS NOT NULL AND contato_whatsapp_id = $2))
        AND direcao = 'entrada'
        AND grupo_whatsapp_id IS NULL
        AND created_at > NOW() - ($3 || ' minutes')::interval
      LIMIT 1`,
    [leadId, contatoWhatsappId ?? null, String(SILENCIO_APOS_LEAD_MIN)]
  );
  return r.rows.length > 0;
}

/**
 * O contato já escreveu para nós ALGUMA vez?
 *
 * É a pergunta que separa um follow-up morno de um primeiro contato frio — e é
 * o primeiro contato frio que faz número comum ser bloqueado pela Meta. Medido
 * na base em 19/09/2026: 75% dos follow-ups saíram para quem nunca tinha escrito,
 * proporção maior que a do próprio disparo em massa (69%).
 *
 * Por contato, nunca por lead: o mesmo número costuma ter card em mais de um
 * funil e a entrada é gravada em apenas um deles. E `grupo_whatsapp_id IS NULL`
 * pelo mesmo motivo de sempre — falar num grupo não é escrever para nós.
 *
 * `copia_indevida` fica de fora: aquelas linhas são o vazamento de agosto, e uma
 * cópia que nunca deveria existir não pode servir de prova de que o contato falou.
 */
export async function contatoJaEscreveuAlgumaVez(
  leadId: number,
  contatoWhatsappId?: number | null
): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM historico_mensagens
      WHERE (lead_id = $1 OR ($2::int IS NOT NULL AND contato_whatsapp_id = $2))
        AND direcao = 'entrada'
        AND grupo_whatsapp_id IS NULL
        AND NOT copia_indevida
      LIMIT 1`,
    [leadId, contatoWhatsappId ?? null]
  );
  return r.rows.length > 0;
}
