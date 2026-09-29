/**
 * Nome de card que é só o telefone. Lead que chega pelo SendFlow (ou por qualquer
 * captação que traga só o número) nasce com o número no nome, e o WhatsApp só conta
 * como a pessoa se chama quando ELA escreve — o `pushname` da mensagem.
 */

/** O card está sem nome de verdade: nem uma letra ("5511999999999", "+55 85 9176-2563"). */
export function nomeEhSoTelefone(nome: string | null | undefined): boolean {
  return !/\p{L}/u.test(String(nome ?? ''));
}

/**
 * O push name serve de nome de card? Precisa ter ao menos uma letra — "." e "🐆" não
 * dizem quem é. Devolve o texto limpo (sem espaços sobrando, teto de 255) ou null.
 */
export function nomeDoPush(pushname: unknown): string | null {
  const limpo = String(pushname ?? '').replace(/\s+/g, ' ').trim().slice(0, 255);
  return /\p{L}/u.test(limpo) ? limpo : null;
}
