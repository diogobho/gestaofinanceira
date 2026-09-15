import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Estado de tela que sobrevive ao F5: mora na query string (`?aba=agenda`), então
 * recarregar a página — ou copiar o link — reabre no mesmo lugar. A troca usa
 * `replace` para não empilhar uma entrada de histórico a cada clique, e o valor
 * padrão não vai para a URL. Valor fora de `validos` (link velho, aba de outro papel)
 * vale como ausente.
 */
export function useAbaNaUrl<T extends string>(
  chave: string,
  padrao: T,
  validos: readonly T[]
): [T, (valor: T) => void] {
  const [params, setParams] = useSearchParams()
  const bruto = params.get(chave) as T | null
  const valor = bruto && validos.includes(bruto) ? bruto : padrao

  const definir = useCallback(
    (novo: T) => {
      setParams(
        (atual) => {
          const proximo = new URLSearchParams(atual)
          if (novo === padrao) proximo.delete(chave)
          else proximo.set(chave, novo)
          return proximo
        },
        { replace: true }
      )
    },
    [chave, padrao, setParams]
  )

  return [valor, definir]
}

const lerLocal = (chave: string): number | undefined => {
  try {
    return Number(localStorage.getItem(chave)) || undefined
  } catch {
    return undefined
  }
}

const gravarLocal = (chave: string, valor: number | undefined) => {
  try {
    if (valor) localStorage.setItem(chave, String(valor))
    else localStorage.removeItem(chave)
  } catch {
    // navegador sem storage: a URL continua valendo
  }
}

/**
 * Funil aberto no CRM. A URL (`?funil=57`) é quem manda — é o que o F5 relê. Sem ela
 * (entrou pelo menu), volta o último funil que ESTE usuário abriu: a chave leva o id
 * do usuário porque o mesmo navegador alterna entre contas (suporte@ e master@).
 *
 * `funisValidos` é a lista da empresa do token: um id que não está nela (link de outra
 * conta, funil excluído) é descartado assim que a lista chega, e o quadro cai no padrão.
 * Enquanto ela carrega, o id guardado já vale — esperar a lista faria o quadro abrir
 * primeiro no funil padrão e trocar depois, que é justamente o que se quer evitar.
 */
export function useFunilNaUrl(
  tipo: 'aquisicao' | 'cx',
  funisValidos: { id: number }[] | undefined
): [number | undefined, (id: number | undefined) => void] {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const chaveLocal = `crm:funil:${tipo}:${user?.id ?? 'anon'}`

  const daUrl = Number(params.get('funil')) || undefined
  const candidato = daUrl ?? lerLocal(chaveLocal)
  // `undefined` = lista ainda carregando (passe o `data` cru do react-query, sem `= []`)
  const valido = !candidato || !funisValidos || funisValidos.some((f) => f.id === candidato)
  const funilId = valido ? candidato : undefined

  const definir = useCallback(
    (id: number | undefined) => {
      gravarLocal(chaveLocal, id)
      setParams(
        (atual) => {
          const proximo = new URLSearchParams(atual)
          if (id) proximo.set('funil', String(id))
          else proximo.delete('funil')
          return proximo
        },
        { replace: true }
      )
    },
    [chaveLocal, setParams]
  )

  // Veio da memória (sem ?funil=): escreve na URL, para o F5 e o link já saírem certos.
  // Veio da URL (link, F5): vira a memória — sair pelo menu e voltar reabre nele.
  // Id inválido sai de onde veio: da URL (a memória, se boa, volta a valer) ou da memória.
  useEffect(() => {
    if (!candidato) return
    if (!valido) {
      if (!daUrl) gravarLocal(chaveLocal, undefined)
      setParams((atual) => {
        const proximo = new URLSearchParams(atual)
        proximo.delete('funil')
        return proximo
      }, { replace: true })
    }
    else if (!daUrl) definir(candidato)
    else if (funisValidos) gravarLocal(chaveLocal, candidato)
  }, [candidato, valido, daUrl, definir, funisValidos, chaveLocal])

  return [funilId, definir]
}
