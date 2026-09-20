import { query } from '../../../config/database';
import { variantesTelefone } from '../../crm/_shared/telefone';

/**
 * Janela de atendimento de 24h do WhatsApp oficial.
 *
 * Regra da Meta: quando o cliente escreve, abre uma janela de 24h (e cada mensagem
 * nova dele reinicia o relógio). Dentro dela vale qualquer mensagem; fora, SÓ modelo
 * aprovado. Receber um modelo NÃO abre a janela — só a mensagem do cliente abre.
 *
 * Por que conferimos antes, em vez de deixar a Meta recusar: o envio fora da janela
 * responde 200 com id de mensagem e a recusa (131047) chega DEPOIS, pelo webhook de
 * status. O follow-up marcaria "enviado" uma mensagem que nunca saiu.
 *
 * A fonte é o nosso histórico: `historico_mensagens` com direcao = 'entrada' e o
 * horário da própria Meta (`to_timestamp(timestamp)` no webhook). A comparação é toda
 * no banco (LOCALTIMESTAMP contra a coluna sem fuso), então fuso nenhum entra na conta.
 */

/** Margem de segurança: a janela é tratada como fechada 2 min antes da Meta fechá-la. */
const MARGEM_SEGUNDOS = 120;

export interface EstadoJanela {
  aberta: boolean;
  /** Última mensagem do cliente (ISO, horário do banco) — null se nunca escreveu. */
  ultimaEntrada: string | null;
  /** Segundos até fechar (0 quando fechada). */
  restaSegundos: number;
}

/** `destino` = número/JID do contato ou `<BSUID>@bsuid`. */
export async function estadoJanela(empresaId: number, destino: string): Promise<EstadoJanela> {
  const bruto = String(destino || '').trim();
  const ehBsuid = /@bsuid$/i.test(bruto);
  const digitos = bruto.replace(/@.*$/, '').replace(/\D/g, '');
  const variantes = ehBsuid ? [] : variantesTelefone(digitos);

  const r = await query(
    `SELECT MAX(hm.enviado_at) AS ultima,
            EXTRACT(EPOCH FROM (MAX(hm.enviado_at) + interval '24 hours' - LOCALTIMESTAMP))::int AS resta
       FROM historico_mensagens hm
       JOIN contatos_whatsapp cw ON cw.id = hm.contato_whatsapp_id
      WHERE hm.empresa_id = $1
        AND hm.direcao = 'entrada'
        AND hm.grupo_whatsapp_id IS NULL
        AND NOT hm.copia_indevida
        AND (
          cw.whatsapp_id = $2
          OR ($4::text IS NOT NULL AND cw.bsuid = $4)
          OR REGEXP_REPLACE(COALESCE(cw.numero, ''), '[^0-9]', '', 'g') = ANY($3::text[])
        )`,
    [empresaId, bruto, variantes, ehBsuid ? bruto.replace(/@bsuid$/i, '') : null]
  );
  const ultima = r.rows[0]?.ultima ?? null;
  const resta = Number(r.rows[0]?.resta ?? 0) - MARGEM_SEGUNDOS;
  return {
    aberta: !!ultima && resta > 0,
    ultimaEntrada: ultima ? new Date(ultima).toISOString() : null,
    restaSegundos: ultima && resta > 0 ? resta : 0,
  };
}

export function mensagemJanelaFechada(estado: EstadoJanela): string {
  const quando = estado.ultimaEntrada
    ? 'a última mensagem deste contato foi há mais de 24h'
    : 'este contato ainda não escreveu para o número oficial';
  return (
    `Fora da janela de 24h do WhatsApp oficial: ${quando}. ` +
    'Fora dela a Meta só entrega modelo aprovado — use "Enviar modelo".'
  );
}
