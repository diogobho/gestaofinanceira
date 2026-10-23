/**
 * Respostas por botão (migration 094) — regras puras, sem banco.
 *
 * Uma regra diz: "no estágio X, se o lead de origem Y clicar no botão Z, envie estas
 * mensagens (texto, áudio, vídeo, imagem, documento) e crie uma tarefa de FUP para N dias".
 * Só o CLIQUE dispara (decisão do dono, 01/10/2026): texto digitado, mesmo "sim", não
 * entra aqui — a equipe responde.
 */

export interface PassoResposta {
  /** Texto da mensagem; com anexo, vira a legenda (áudio não tem legenda: sai separado). */
  texto?: string | null;
  media_url?: string | null;
  media_mimetype?: string | null;
  media_filename?: string | null;
  /** Botões de resposta rápida desta mensagem (só QR; até 3, 20 caracteres) — a pessoa
   *  responde tocando, e o clique cai nas regras da etapa para onde o card foi movido. */
  botoes?: string[] | null;
}

export interface RegraResposta {
  id?: number;
  /** Origem do lead (`leads.origem`); vazia = qualquer origem. */
  origem: string | null;
  /** Texto do botão, como aparece no modelo da Meta. */
  botao: string;
  passos: PassoResposta[];
  /** Tarefa de follow-up para daqui a N dias; null/0 = sem tarefa. */
  tarefa_dias: number | null;
  /** Depois do clique, move o card para esta etapa (mesmo funil); null = fica onde está. */
  mover_para_estagio_id?: number | null;
  /** Vale também a resposta ESCRITA igual ao botão ("sim", "Sim!"). Para o QR, onde o
   *  WhatsApp descarta o botão de número comum (testado em 05/10). Desligado por padrão:
   *  a regra original é "só o clique dispara". */
  aceita_texto?: boolean;
  ativa: boolean;
}

export const LIMITE_PASSOS = 10;

/** "Sim, conheço" e " sim,  CONHECO " são o mesmo botão. */
export const normalizar = (s: string | null | undefined) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * A regra que vale para este clique: mesmo botão, origem igual à do lead ou regra sem
 * origem. A regra com origem vence a genérica — é o que permite "Clube do Livro + Não"
 * e um "Não" de reserva para as outras origens.
 */
export function escolherRegra<T extends RegraResposta>(regras: T[], origemLead: string | null, botao: string): T | null {
  const b = normalizar(botao);
  const o = normalizar(origemLead);
  if (!b) return null;
  const candidatas = regras.filter(r => r.ativa && normalizar(r.botao) === b && (!normalizar(r.origem) || normalizar(r.origem) === o));
  return candidatas.find(r => normalizar(r.origem)) ?? candidatas[0] ?? null;
}

/** "Sim!!", "sim 😊", "SIM, quero" → "sim" / "sim quero": sem acento, caixa, pontuação e emoji. */
const palavras = (s: string | null | undefined) =>
  normalizar(s).replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * A regra que uma resposta ESCRITA aciona (só regras com `aceita_texto`). Casa a frase
 * igual ao botão, ou o botão seguido de no máximo duas palavras ("sim quero", "não
 * obrigado"). Frase maior fica para gente: "não sei se agora dá" não é um NÃO.
 */
export function regraDaRespostaEscrita<T extends RegraResposta>(regras: T[], origemLead: string | null, texto: string): T | null {
  const t = palavras(texto);
  if (!t) return null;
  const aceitas = regras.filter(r => r.aceita_texto);
  for (const r of aceitas) {
    const b = palavras(r.botao);
    if (!b) continue;
    const resto = t === b ? '' : t.startsWith(b + ' ') ? t.slice(b.length + 1) : null;
    if (resto === null || resto.split(' ').filter(Boolean).length > 2) continue;
    const escolhida = escolherRegra(aceitas, origemLead, r.botao);
    if (escolhida) return escolhida;
  }
  return null;
}

/** Recusa o que não daria para enviar, com a frase que a tela mostra. */
export function problemaNasRegras(regras: RegraResposta[]): string | null {
  const vistas = new Set<string>();
  for (const [i, r] of regras.entries()) {
    const n = `Regra ${i + 1}`;
    if (!normalizar(r.botao)) return `${n}: escreva o texto do botão.`;
    if (String(r.botao).length > 60) return `${n}: o texto do botão passa de 60 caracteres.`;
    if (r.origem && String(r.origem).length > 50) return `${n}: a origem passa de 50 caracteres.`;
    const chave = `${normalizar(r.origem)}|${normalizar(r.botao)}`;
    if (vistas.has(chave)) return `${n}: já existe outra regra para o mesmo botão e a mesma origem.`;
    vistas.add(chave);
    const passos = r.passos || [];
    if (passos.length > LIMITE_PASSOS) return `${n}: no máximo ${LIMITE_PASSOS} mensagens.`;
    for (const [j, p] of passos.entries()) {
      if (!String(p.texto || '').trim() && !p.media_url) return `${n}, mensagem ${j + 1}: escreva o texto ou anexe um arquivo.`;
      if (p.media_url && !String(p.media_url).startsWith('/uploads/')) return `${n}, mensagem ${j + 1}: anexo inválido.`;
      const bs = p.botoes || [];
      if (bs.length > 3) return `${n}, mensagem ${j + 1}: no máximo 3 botões.`;
      if (bs.some((b) => !String(b).trim() || String(b).trim().length > 20)) return `${n}, mensagem ${j + 1}: cada botão tem de 1 a 20 caracteres.`;
      if (bs.length && p.media_url) return `${n}, mensagem ${j + 1}: botões só em mensagem de texto.`;
    }
    if (!passos.length && !r.tarefa_dias && !r.mover_para_estagio_id) return `${n}: escolha ao menos uma mensagem, a tarefa de FUP ou a etapa para onde mover.`;
    const d = r.tarefa_dias;
    if (d != null && (!Number.isInteger(Number(d)) || Number(d) < 0 || Number(d) > 365)) return `${n}: a tarefa vai de 0 a 365 dias.`;
  }
  return null;
}

/** Data (YYYY-MM-DD) de Brasília daqui a N dias — a tarefa vence no dia, não na hora. */
export function dataDaqui(dias: number, agora = new Date()): string {
  const d = new Date(agora.getTime() + dias * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
