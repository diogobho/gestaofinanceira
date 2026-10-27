/**
 * Marcar pessoas com @ nas mensagens de grupo (30/09/2026).
 *
 * Na tela a pessoa escreve "@Ana Souza"; o WhatsApp só transforma em menção o
 * "@<número>" do jid que vai em `mentions` — e mostra, para cada participante, o nome
 * que ELE tem para aquele número. Então o texto guardado é o legível ("@Ana Souza") e
 * a troca pelo "@<número>" acontece na hora do envio, grupo a grupo:
 *
 * - a mensagem pode ir para vários grupos, e a pessoa marcada só está em alguns. Onde
 *   ela não está, o "@Ana Souza" vira "Ana Souza" — sem @, porque "@5511…" cru no
 *   meio do texto é pior que o nome;
 * - o grupo pode enxergar a pessoa pelo telefone (`@s.whatsapp.net`) ou pelo `@lid`;
 *   vale o id com que ELE a lista, senão o WhatsApp não desenha a menção.
 *
 * Sem dependência de banco nem de rede: teste em `tests/grupos-mencoes.test.ts`.
 */

export interface Mencao {
  /** Id do participante como a lista do grupo trouxe (`…@s.whatsapp.net` ou `…@lid`). */
  id: string;
  /** Telefone resolvido (só dígitos) — casa a pessoa num grupo que a lista pelo outro id. */
  numero: string;
  /** O que aparece no texto depois do @, ex.: "Ana Souza". */
  rotulo: string;
}

export interface Participante {
  id: string;
  number?: string;
}

export const MAX_MENCOES = 50;
const JID_PESSOA = /^[\w.:-]+@(s\.whatsapp\.net|lid|c\.us)$/;

/** Menções válidas e ainda presentes no texto. O que o operador apagou do texto sai. */
export function normalizarMencoes(entrada: unknown, texto: string): Mencao[] {
  if (!Array.isArray(entrada)) return [];
  const vistas = new Set<string>();
  const saida: Mencao[] = [];
  for (const m of entrada) {
    const id = String((m as any)?.id || '').trim();
    const numero = String((m as any)?.numero || '').replace(/\D/g, '').slice(0, 20);
    const rotulo = String((m as any)?.rotulo || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!JID_PESSOA.test(id) || !rotulo || vistas.has(rotulo)) continue;
    if (!texto.includes(`@${rotulo}`)) continue;
    vistas.add(rotulo);
    saida.push({ id, numero, rotulo });
    if (saida.length >= MAX_MENCOES) break;
  }
  return saida;
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Texto e jids de UM grupo. `participantes` nulo = não foi possível ler a lista do
 * grupo: sai o nome sem @, que é o que ninguém estranha.
 */
export function aplicarMencoes(
  texto: string, mencoes: Mencao[], participantes: Participante[] | null
): { texto: string; jids: string[] } {
  if (!mencoes.length) return { texto, jids: [] };
  const porId = new Map<string, Participante>();
  const porNumero = new Map<string, Participante>();
  for (const p of participantes || []) {
    porId.set(p.id, p);
    const n = String(p.number || '').replace(/\D/g, '');
    if (n) porNumero.set(n, p);
  }
  const jids: string[] = [];
  // Rótulo mais longo primeiro: "@Ana Souza" antes de "@Ana".
  const ordem = [...mencoes].sort((a, b) => b.rotulo.length - a.rotulo.length);
  let saida = texto;
  for (const m of ordem) {
    const p = porId.get(m.id) || (m.numero ? porNumero.get(m.numero) : undefined);
    const alvo = new RegExp(`@${escaparRegex(m.rotulo)}`, 'g');
    if (!p) { saida = saida.replace(alvo, () => m.rotulo); continue; }
    const token = `@${p.id.split('@')[0]}`;
    saida = saida.replace(alvo, () => token);
    if (!jids.includes(p.id)) jids.push(p.id);
  }
  return { texto: saida, jids };
}
