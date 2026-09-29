/**
 * Regras do webhook do SendFlow que não dependem de banco.
 *
 * Uma conta do SendFlow roda várias campanhas e cada campanha é um grupo de
 * WhatsApp. Todas entram pelo mesmo webhook, e o que separa uma da outra no CRM
 * é a ORIGEM do lead — é ela que aparece no card, no filtro e no relatório.
 */

export interface CampanhaSendflow {
  /** Valor de `leads.origem` (VARCHAR(50)). */
  origem: string;
  /** Nome da campanha nas notas quando o payload não traz `campaignName`. */
  campanha: string;
}

/**
 * Campanhas com origem própria. O teste é pelo nome do GRUPO ou da campanha,
 * porque no SendFlow os dois são digitados pelo cliente e qualquer um pode ser
 * o que carrega o nome do produto ("Grupos LEADS" é campanha genérica).
 *
 * A origem do Club do Livro é exatamente a dos 46 leads que a Débora cadastrou à
 * mão até 23/09/2026 — grafia diferente partiria o relatório em dois.
 *
 * O Workshop entrava como Desafio 52 Semanas até 29/09/2026 (pedido #195 da Débora,
 * que conta as três campanhas separadas). Os workshops cadastrados à mão têm o tema no
 * nome ("Workshop Lidere Sua Vida"); este segue o mesmo formato.
 */
const CAMPANHAS: Array<{ padrao: RegExp; origem: string; campanha: string }> = [
  { padrao: /livro/i, origem: 'Clube do Livro', campanha: 'Clube do Livro' },
  { padrao: /workshop/i, origem: 'Workshop Liberdade Financeira', campanha: 'Workshop Liberdade Financeira' },
];

export function campanhaDoEvento(
  campanha: string,
  grupo: string,
  padrao: CampanhaSendflow
): CampanhaSendflow {
  const texto = `${campanha || ''} ${grupo || ''}`;
  const achada = CAMPANHAS.find((c) => c.padrao.test(texto));
  return achada ? { origem: achada.origem, campanha: achada.campanha } : padrao;
}

/**
 * O evento do SendFlow não diz por qual número a campanha foi disparada — só quem
 * entrou no grupo. O dono do lead vem, então, da URL do webhook: cada conta/número
 * do SendFlow é cadastrada com a própria URL, com `&dono=<id do usuário>`.
 *
 * Devolve o id pedido (inteiro positivo) ou null. Quem confere se o usuário é
 * mesmo da empresa e está ativo é o controller, com o banco na mão.
 */
export function donoPedidoNaUrl(q: Record<string, unknown>): number | null {
  for (const chave of ['dono', 'responsavel', 'responsavel_id', 'proprietario']) {
    const bruto = q[chave];
    const valor = String(Array.isArray(bruto) ? bruto[0] : bruto ?? '').trim();
    if (/^\d{1,9}$/.test(valor) && Number(valor) > 0) return Number(valor);
  }
  return null;
}
