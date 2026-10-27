/**
 * A origem do lead decidindo o texto do modelo (06/10/2026, funil oficial da Escola).
 *
 * `leads.origem` é o que a captação grava ("Clube do Livro", "Caixa Rápido - outros"), e
 * não cabe no meio de uma frase. Duas coisas dependem dela:
 * - a variável [OrigemFrase] ("Quem dá o primeiro passo no clube do livro…"), traduzida
 *   pela regra da EMPRESA em `empresas.config.origem_frases`, porque cada conta tem as suas
 *   origens;
 * - a abertura, que tem uma versão por origem (`modelo_whatsapp.por_origem` no passo).
 *
 * A comparação ignora caixa e acento e procura o trecho dentro da origem: "Clube do livro"
 * e "Caixa Rápido - outros" casam com "clube do livro" e "caixa rapido".
 */

export interface RegraOrigem {
  contem: string;
}

export interface FrasesOrigem {
  regras?: Array<RegraOrigem & { frase: string }>;
  padrao?: string | null;
}

export function normalizarOrigem(s: unknown): string {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A primeira regra cujo trecho aparece na origem; sem nenhuma, null. */
export function regraDaOrigem<T extends RegraOrigem>(regras: T[] | null | undefined, origem: unknown): T | null {
  const o = normalizarOrigem(origem);
  if (!o) return null;
  return (regras ?? []).find((r) => {
    const c = normalizarOrigem(r?.contem);
    return !!c && o.includes(c);
  }) ?? null;
}

/** "no clube do livro" | a frase padrão | '' (vazio barra o modelo que a usa). */
export function fraseDaOrigem(cfg: FrasesOrigem | null | undefined, origem: unknown): string {
  return regraDaOrigem(cfg?.regras, origem)?.frase ?? String(cfg?.padrao ?? '');
}

/**
 * O card tem nome de verdade? O que entra pelo grupo ou pelo SendFlow nasce com o número
 * no lugar do nome ("5511963658408"), e a abertura sairia "Olá 5511963658408, como vai?".
 */
export function temNomeDeVerdade(nome: unknown): boolean {
  return /\p{L}/u.test(String(nome ?? ''));
}

/**
 * O nome do modelo para esta origem: a versão da origem, ou o modelo do passo.
 * Card sem nome (09/10/2026): a regra pode trazer `sem_nome`, um modelo sem variável
 * ("Olá, seja bem-vindo…") — usado no lugar do que leva o nome.
 */
export function modeloDaOrigem<M extends { nome: string; variaveis?: string[]; por_origem?: Array<RegraOrigem & { nome: string; sem_nome?: string | null }> | null }>(
  modelo: M,
  origem: unknown,
  temNome = true
): M {
  const r = regraDaOrigem(modelo.por_origem, origem);
  if (!r) return modelo;
  if (!temNome && r.sem_nome) return { ...modelo, nome: r.sem_nome, variaveis: [] };
  return { ...modelo, nome: r.nome };
}

/**
 * Teste A/B do playbook: o passo traz `variante_b` ({nome, variaveis}) além do modelo A.
 * A variante sai do id do lead (par = A, ímpar = B): alterna entre leads e o MESMO lead
 * fica com a mesma variante em todas as etapas, sem guardar estado. Sem `variante_b`,
 * não há teste (variante null).
 */
export function varianteDoLead<M extends { nome: string; variaveis?: string[]; sem_nome?: ModeloSemNome | null; variante_b?: { nome: string; variaveis?: string[]; sem_nome?: ModeloSemNome | null } | null }>(
  modelo: M,
  leadId: number
): { modelo: M; variante: 'A' | 'B' | null } {
  const b = modelo.variante_b;
  if (!b?.nome) return { modelo, variante: null };
  if (Number(leadId) % 2 === 0) return { modelo, variante: 'A' };
  return { modelo: { ...modelo, nome: b.nome, variaveis: b.variaveis ?? modelo.variaveis, sem_nome: b.sem_nome ?? null }, variante: 'B' };
}

export interface ModeloSemNome { nome: string; variaveis?: string[] }

/**
 * Card sem nome fora da abertura (13/10/2026): o passo (e a `variante_b`) pode trazer
 * `sem_nome: {nome, variaveis}`, a versão do modelo sem [PrimeiroNome]. Na Tentativa do
 * funil 74, 11 de 12 cards eram só o número e o dia 3 sairia "Oi 5521975075749, tudo bem?".
 * Chamar DEPOIS de `varianteDoLead`, que já trocou o `sem_nome` pelo da variante.
 */
export function modeloSemNome<M extends { nome: string; variaveis?: string[]; sem_nome?: ModeloSemNome | null }>(
  modelo: M,
  temNome: boolean
): M {
  if (temNome || !modelo.sem_nome?.nome) return modelo;
  return { ...modelo, nome: modelo.sem_nome.nome, variaveis: modelo.sem_nome.variaveis ?? [] };
}
