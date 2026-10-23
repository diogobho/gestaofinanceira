/**
 * Editar o texto de um modelo do fluxo (06/10/2026). A Meta não deixa editar modelo em
 * análise, e nome excluído fica bloqueado por 30 dias: editar é criar uma VERSÃO NOVA
 * (`abr_ger_v1` → `abr_ger_v2`) com o mesmo cabeçalho, rodapé, botões e categoria, e
 * apontar o passo do fluxo para ela. O texto vem com os campos do card escritos por
 * extenso ("Oi [PrimeiroNome]!"), que é como o dono lê; aqui viram `{{1}}`, `{{2}}`…
 */

/** Exemplo que vai para a Meta por campo do card (ela exige um por variável). */
const EXEMPLOS: Record<string, string> = {
  PrimeiroNome: 'Maria',
  Nome: 'Maria Souza',
  PrimeiroNomeResponsavel: 'Débora',
  Responsavel: 'Débora Silva',
  OrigemFrase: 'no Clube do Livro',
  Negocio: 'loja de roupas',
  Objetivo: 'aumentar as vendas',
  Desafio: 'organizar o financeiro',
  Duvida: 'como funcionam as aulas',
  Presente: 'um e-book exclusivo',
  DiaReuniao: 'quarta-feira, 14/10',
  HoraReuniao: '16h',
  LinkReuniao: 'https://meet.google.com/abc-defg-hij',
  Horario1: 'quinta-feira, 15/10, às 16h',
  Horario2: 'sexta-feira, 16/10, às 16h',
};

export function exemploDoCampo(token: string): string {
  const chave = token.replace(/^\[|\]$/g, '');
  return EXEMPLOS[chave] ?? 'exemplo';
}

/**
 * "Oi [PrimeiroNome], [OrigemFrase]… [PrimeiroNome]" → corpo com `{{n}}` na ordem da
 * primeira aparição (a Meta exige 1, 2, 3… sem pular) e a lista de campos para o passo.
 */
export function textoParaModelo(texto: string): { corpo: string; variaveis: string[]; exemplos: string[] } {
  const variaveis: string[] = [];
  const corpo = texto.replace(/\[[A-Za-zÀ-ÿ0-9]+\]/g, (token) => {
    let i = variaveis.indexOf(token);
    if (i < 0) { variaveis.push(token); i = variaveis.length - 1; }
    return `{{${i + 1}}}`;
  });
  return { corpo, variaveis, exemplos: variaveis.map(exemploDoCampo) };
}

/** O contrário, para mostrar: `{{1}}` → o campo do card configurado no passo. */
export function modeloParaTexto(corpo: string, variaveis: string[]): string {
  return corpo.replace(/\{\{(\d+)\}\}/g, (m, n) => variaveis[Number(n) - 1] ?? m);
}

/** `abr_ger_v1` → `abr_ger_v2`, pulando nome que já existe na conta (inclusive excluído recente). */
export function proximaVersao(nome: string, existentes: string[]): string {
  const base = nome.replace(/_v\d+$/, '');
  const usados = new Set(existentes);
  let maior = 0;
  for (const e of existentes) {
    const m = e.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_v(\\d+)$`));
    if (m) maior = Math.max(maior, Number(m[1]));
  }
  let v = Math.max(maior, Number(nome.match(/_v(\d+)$/)?.[1] ?? 1)) + 1;
  while (usados.has(`${base}_v${v}`)) v++;
  return `${base}_v${v}`;
}
