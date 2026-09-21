import { useTheme } from '@/contexts/ThemeContext'

/**
 * Paleta do dashboard Conta Azul.
 *
 * Os valores NÃO são escolha de gosto: passaram no validador de paleta
 * (banda de luminosidade, piso de croma, separação sob daltonismo e contraste)
 * contra as superfícies reais do app — `#ffffff` no claro e `#1f2937` (gray-800,
 * o fundo do Card) no escuro.
 *
 *  - Série (a receber / a pagar / saldo): PASSA em todos os pares nos dois modos.
 *  - Status: a dupla verde↔vermelho é indistinguível sob deuteranopia (ΔE 4,1).
 *    É limitação conhecida da paleta de status, e a mitigação exigida é não
 *    deixar a cor sozinha: todo gráfico de status aqui leva rótulo direto,
 *    legenda com valor e a tabela detalhada logo abaixo.
 */

export interface PaletaViz {
  receber: string
  pagar: string
  saldo: string
  /** quitado — recebido ou pago */
  quitado: string
  /** em aberto e ainda dentro do prazo */
  aVencer: string
  /** em aberto e vencido */
  atrasado: string
  /** baixado como perda */
  perdido: string
  grid: string
  eixo: string
  tooltipBg: string
  tooltipBorda: string
  tooltipTexto: string
}

const CLARO: PaletaViz = {
  receber: '#1baf7a',
  pagar: '#eb6834',
  saldo: '#2a78d6',
  quitado: '#0ca30c',
  aVencer: '#fab219',
  atrasado: '#d03b3b',
  perdido: '#9ca3af',
  grid: '#eef0f3',
  eixo: '#6b7280',
  tooltipBg: '#ffffff',
  tooltipBorda: '#e5e7eb',
  tooltipTexto: '#111827',
}

const ESCURO: PaletaViz = {
  receber: '#199e70',
  pagar: '#d95926',
  saldo: '#3987e5',
  quitado: '#0ca30c',
  aVencer: '#fab219',
  atrasado: '#d03b3b',
  perdido: '#6b7280',
  grid: '#374151',
  eixo: '#9ca3af',
  tooltipBg: '#1f2937',
  tooltipBorda: '#374151',
  tooltipTexto: '#f3f4f6',
}

export function usePaletaViz(): PaletaViz {
  const { theme } = useTheme()
  return theme === 'dark' ? ESCURO : CLARO
}

/**
 * Troca de hex para levar um gráfico ao papel branco do relatório.
 *
 * O PDF é sempre claro. Um gráfico copiado da tela no tema ESCURO leva o eixo
 * em `#9ca3af` e a grade em `#374151` — invisível e pesada demais no branco.
 * No tema claro não há o que trocar.
 */
export function mapaParaImpressao(paleta: PaletaViz): Record<string, string> {
  if (paleta === CLARO) return {}
  const mapa: Record<string, string> = {}
  for (const chave of Object.keys(CLARO) as (keyof PaletaViz)[]) {
    if (ESCURO[chave] !== CLARO[chave]) mapa[ESCURO[chave]] = CLARO[chave]
  }
  return mapa
}
