/**
 * Regras puras das campanhas de grupo (migration 089). Sem banco nem WhatsApp — é o
 * que os testes prendem (`tests/grupos-campanhas.test.ts`).
 */

/** "Lançamento Outubro 2026!" → "lancamento-outubro-2026". Teto de 50 para sobrar o sufixo. */
export function slugDe(texto: string): string {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

export function slugValido(slug: unknown): slug is string {
  return typeof slug === 'string' && /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])$/.test(slug);
}

/** "Turma {{n}}" → "Turma 3". Sem {{n}} no modelo, o número vai no fim. Teto do WhatsApp: 100. */
export function nomeDoGrupo(modelo: string, n: number): string {
  const base = String(modelo || '').trim() || 'Grupo';
  const nome = /\{\{\s*n\s*\}\}/i.test(base) ? base.replace(/\{\{\s*n\s*\}\}/gi, String(n)) : `${base} ${n}`;
  return nome.slice(0, 100);
}

export interface GrupoDaCampanha {
  grupo_id: string;
  convite: string | null;
  participantes: number;
  ordem: number;
  cheio: boolean;
  ativo: boolean;
}

/**
 * Para onde o link manda: o PRIMEIRO grupo ativo (pela ordem) com vaga e convite.
 * Encher um de cada vez, e não espalhar, é o que o SendFlow faz e o que faz sentido:
 * grupo meio vazio parece abandonado, e a conversa acontece onde tem gente.
 */
export function grupoComVaga<T extends GrupoDaCampanha>(grupos: T[], limite: number): T | null {
  return [...grupos]
    .filter((g) => g.ativo && !g.cheio && !!g.convite && g.participantes < limite)
    .sort((a, b) => a.ordem - b.ordem)[0] || null;
}

/**
 * Hora de abrir o próximo grupo: nenhum ativo com vaga "folgada". A margem existe
 * porque a contagem vem de evento e de leitura periódica — com ela, o grupo novo já
 * está pronto quando o atual enche, e ninguém cai numa página de "sem vaga".
 */
export function precisaDeGrupoNovo(grupos: GrupoDaCampanha[], limite: number, margem = 20): boolean {
  const folga = Math.max(1, Math.min(margem, Math.floor(limite * 0.1)));
  return !grupos.some((g) => g.ativo && !g.cheio && !!g.convite && g.participantes < limite - folga);
}

/** Chip que cria o próximo grupo: o que tem menos grupos na campanha (empate: o primeiro da lista). */
export function chipDaVez(chips: number[], gruposPorChip: Record<number, number>): number | null {
  if (!chips.length) return null;
  return [...chips].sort((a, b) => (gruposPorChip[a] || 0) - (gruposPorChip[b] || 0) || chips.indexOf(a) - chips.indexOf(b))[0];
}

/**
 * Variações de texto: `{Oi|Olá|E aí}` vira uma das opções, sorteada por envio. A mesma
 * mensagem caindo idêntica em 20 grupos é o padrão que o WhatsApp reconhece como
 * disparo. Só vale chave com `|` dentro — `{{nome}}` e chave comum ficam como estão.
 */
export function aplicarVariacoes(texto: string, sortear: () => number = Math.random): string {
  return String(texto || '').replace(/\{([^{}|]*(?:\|[^{}|]*)+)\}/g, (_m, dentro: string) => {
    const opcoes = dentro.split('|');
    return opcoes[Math.min(opcoes.length - 1, Math.floor(sortear() * opcoes.length))];
  });
}

/** Robôs de pré-visualização abrem o link sem ninguém ter clicado. */
export function ehRobo(userAgent: string | undefined): boolean {
  return /bot|crawl|spider|facebookexternalhit|whatsapp|telegram|slack|discord|preview|embedly|skype/i.test(String(userAgent || ''));
}

/** utm da URL, reduzido para virar chave de relatório ("Instagram" e "instagram " são o mesmo). */
export function utmLimpo(v: unknown): string | null {
  const s = String(Array.isArray(v) ? v[0] : v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return s || null;
}
