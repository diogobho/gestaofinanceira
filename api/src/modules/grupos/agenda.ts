/**
 * Regras puras da página de Grupos: quando uma mensagem recorrente sai de novo e
 * como o texto de boas-vindas é montado. Sem banco — é o que os testes prendem.
 *
 * Brasília não tem horário de verão desde 2019: o fuso é -03:00 fixo, e fazer a
 * conta com ele é mais previsível que depender do fuso do processo.
 */

const OFFSET_BRT_MS = -3 * 3600 * 1000;

export function horaValida(hora: unknown): hora is string {
  return typeof hora === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(hora);
}

export function diasValidos(dias: unknown): dias is number[] {
  return Array.isArray(dias) && dias.length > 0 && dias.every((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

/**
 * Próximo instante, estritamente depois de `depoisDe`, que cai num dos `dias`
 * (0 = domingo, no calendário de Brasília) na `hora` HH:MM de Brasília.
 */
export function proximaRecorrencia(dias: number[], hora: string, depoisDe: Date): Date {
  const [h, m] = hora.split(':').map(Number);
  // "Relógio de parede" de Brasília como se fosse UTC, para usar getUTC* sem fuso.
  const agoraBrt = new Date(depoisDe.getTime() + OFFSET_BRT_MS);
  for (let i = 0; i <= 7; i++) {
    const d = new Date(Date.UTC(agoraBrt.getUTCFullYear(), agoraBrt.getUTCMonth(), agoraBrt.getUTCDate() + i, h, m));
    if (!dias.includes(d.getUTCDay())) continue;
    const instante = new Date(d.getTime() - OFFSET_BRT_MS);
    if (instante.getTime() > depoisDe.getTime()) return instante;
  }
  throw new Error('recorrência sem dia possível');
}

/** "Ana", "Ana e Bia", "Ana, Bia e Carla". */
export function juntarNomes(nomes: string[]): string {
  const n = nomes.filter(Boolean);
  if (n.length <= 1) return n[0] || '';
  return `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}`;
}

export interface Entrante {
  jid: string;
  nome: string | null;
}

/**
 * Uma mensagem só para todos que entraram na mesma janela: 30 pessoas pelo link
 * viram UMA mensagem marcando as 30, não 30 mensagens seguidas no grupo.
 *
 * Variáveis: {{nome}}, {{primeiro_nome}}, {{nome_grupo}}, {{mencoes}}. Com
 * `mencionar`, o WhatsApp só destaca quem aparece como @número no texto — se o
 * modelo não trouxer {{mencoes}}, as menções entram na primeira linha.
 */
export function montarBoasVindas(
  modelo: string,
  entrantes: Entrante[],
  nomeGrupo: string | null,
  mencionar: boolean
): { texto: string; mencoes: string[] } {
  const numeros = entrantes.map((e) => e.jid.replace(/@.*$/, ''));
  const nomes = entrantes.map((e, i) => (e.nome || '').trim() || (mencionar ? `@${numeros[i]}` : ''));
  const primeiros = nomes.map((n) => (n.startsWith('@') ? n : n.split(/\s+/)[0]));
  const arrobas = numeros.map((n) => `@${n}`).join(' ');

  let texto = modelo
    .replace(/\{\{\s*nome\s*\}\}/gi, juntarNomes(nomes) || 'pessoal')
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, juntarNomes(primeiros) || 'pessoal')
    .replace(/\{\{\s*nome_grupo\s*\}\}/gi, nomeGrupo || 'grupo');

  if (!mencionar) return { texto: texto.replace(/\{\{\s*mencoes\s*\}\}/gi, '').trim(), mencoes: [] };

  if (/\{\{\s*mencoes\s*\}\}/i.test(texto)) texto = texto.replace(/\{\{\s*mencoes\s*\}\}/gi, arrobas);
  else if (!numeros.every((n) => texto.includes(`@${n}`))) texto = `${arrobas}\n${texto}`;
  return { texto: texto.trim(), mencoes: entrantes.map((e) => e.jid) };
}
