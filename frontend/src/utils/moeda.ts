// Valor em reais digitado à brasileira (#184). O campo era <input type="number">
// com "0,00" de exemplo, e o navegador recusava a vírgula: quem digitava centavos
// não conseguia, e "R$ 9.700,00" na tela parecia um zero a mais.

/**
 * Lê o que a pessoa digitou. Aceita "9700", "9.700", "9700,50", "9.700,50" e
 * também "9700.50" (quem se acostumou com o campo antigo). Vazio ou ilegível
 * vira `undefined` — o mesmo que não informar.
 *
 * Com vírgula, ela é o decimal e todo ponto é milhar. Sem vírgula, ponto seguido
 * de exatamente 3 dígitos é milhar ("9.700"); qualquer outro é decimal ("9700.5").
 */
export function lerValorBR(texto: string): number | undefined {
  const limpo = texto.replace(/[R$\s]/g, '')
  if (!limpo) return undefined

  let normalizado: string
  if (limpo.includes(',')) {
    normalizado = limpo.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    normalizado = limpo.replace(/\./g, '')
  } else {
    normalizado = limpo
  }

  if (!/^\d+(\.\d+)?$/.test(normalizado)) return undefined
  return Math.round(Number(normalizado) * 100) / 100
}

/** Valor para mostrar no campo: "9.700,00". Zero ou vazio vira campo vazio. */
export function valorParaCampo(valor: number | string | null | undefined): string {
  const n = Number(valor)
  if (!valor || !Number.isFinite(n) || n <= 0) return ''
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
