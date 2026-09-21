/**
 * `utm_source` da URL de uma landing → valor curto e estável para o relatório.
 *
 * Regra pura, fora do controller de propósito: o texto vem da barra de endereços,
 * ou seja, de quem quiser, e o que ele vira é CHAVE DE RELATÓRIO. A mesma campanha
 * chegando como "Semana2", "semana 2" e "semana2" partiria o recorte em três, que
 * é exatamente o que separar a campanha por semana existe para evitar.
 */

/** Sem utm na URL (ou com lixo no lugar dele) o lead vai para este balde. */
export const UTM_PADRAO = 'outros';

/** O que sobra em `leads.origem` (VARCHAR(50)) depois do prefixo "Caixa Rápido - ". */
export const UTM_MAX = 30;

export function normalizarUtmSource(valor: string | null | undefined): string {
  const limpo = String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, UTM_MAX)
    // O corte pode cair no meio de um separador: "semana-" não é um valor.
    .replace(/-+$/, '');
  return limpo || UTM_PADRAO;
}
