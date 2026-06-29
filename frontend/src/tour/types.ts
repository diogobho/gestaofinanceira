import type { UserPermissoes, User } from '@/types/user'

/** Papéis que liberam passos restritos (mesma lógica de admin da Sidebar). */
export type TourRole = NonNullable<User['nivel']>

/**
 * Um passo do tour. Espelha a API do driver.js (element + popover),
 * acrescido de metadados de roteamento e RBAC controlados pelo TourContext.
 */
export interface TourStep {
  /** Seletor do elemento âncora. Por convenção usamos [data-tour="..."]. */
  element?: string
  /** Título do balão. */
  titulo: string
  /** Texto explicativo (HTML simples permitido). */
  descricao: string
  /** Posição do balão em relação ao elemento. */
  lado?: 'top' | 'right' | 'bottom' | 'left' | 'over'
  /** Alinhamento do balão. */
  alinhamento?: 'start' | 'center' | 'end'
  /** Rota onde o elemento existe. Se diferente da atual, o tour navega antes. */
  rota?: string
  /** Passo só entra se o usuário tem esta permissão. */
  permissao?: keyof UserPermissoes
  /** Passo só entra se o usuário tem um destes níveis. */
  papeis?: TourRole[]
  /** Abrir a sidebar (mobile) antes de destacar este passo. */
  requerSidebar?: boolean
}

/** Um tour é uma coleção nomeada de passos. */
export interface Tour {
  /** Identificador estável usado na persistência (localStorage). */
  id: string
  /** Nome legível exibido no menu de tutoriais. */
  nome: string
  /** Passos na ordem de execução. */
  passos: TourStep[]
  /** Se true, dispara automaticamente no 1º acesso (tour de boas-vindas). */
  autoIniciar?: boolean
  /**
   * Rota que dispara o tour automaticamente na 1ª visita à página.
   * O auto-start só ocorre após o tour de boas-vindas ter sido concluído,
   * e apenas uma vez (persistido em localStorage por id do tour).
   */
  iniciarNaRota?: string
}
