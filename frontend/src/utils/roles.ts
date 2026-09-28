/**
 * Papéis dentro da empresa — espelha `api/src/shared/roles.ts`.
 *
 *   comum   (0) → operação, limitada pelas permissões que o master define
 *   master  (1) → administra usuários e a operação
 *   creator (2) → tudo do master + ÚNICO que configura o agente de IA
 *
 * O super_admin é do SISTEMA (vem de `nivel`) e passa por cima de tudo.
 *
 * A maioria das telas que checava `tipo_usuario === 'master'` queria dizer
 * "administrador da empresa" — o creator também é e precisa continuar entrando nelas.
 * Use `isAdminEmpresa` nesses casos; `podeConfigurarAgenteIA` é só para o que é
 * exclusivo do dono. Quem manda é sempre o backend: aqui é só para não mostrar
 * botão que vai levar 403.
 */

export type TipoUsuario = 'comum' | 'master' | 'creator'

interface RoleCarrier {
  nivel?: string | null
  tipo_usuario?: string | null
}

const RANK: Record<string, number> = { comum: 0, master: 1, creator: 2 }

export const rankTipo = (tipo?: string | null): number => RANK[tipo || 'comum'] ?? 0

export const isSuperAdmin = (u?: RoleCarrier | null): boolean => u?.nivel === 'super_admin'

export const isCreator = (u?: RoleCarrier | null): boolean => u?.tipo_usuario === 'creator'

export const isAdminEmpresa = (u?: RoleCarrier | null): boolean =>
  isSuperAdmin(u) || u?.tipo_usuario === 'master' || u?.tipo_usuario === 'creator'

export const podeConfigurarAgenteIA = (u?: RoleCarrier | null): boolean =>
  isSuperAdmin(u) || isCreator(u)

/** Rótulo exibido para o usuário (perfil, sidebar, badge da lista). */
export const rotuloTipo = (u?: RoleCarrier | null): string => {
  if (isSuperAdmin(u)) return 'Admin'
  if (u?.tipo_usuario === 'creator') return 'Creator'
  if (u?.tipo_usuario === 'master') return 'Master'
  return 'Usuário'
}

interface PermissoesCarrier extends RoleCarrier {
  permissoes?: object | null
}

// Ordem do menu: a primeira tela liberada é a casa de quem não tem o Dashboard.
const TELAS_POR_PERMISSAO: [string, string][] = [
  ['dashboard', '/dashboard'],
  ['crm', '/crm'],
  ['clientes', '/clientes'],
  ['receitas', '/receitas'],
  ['despesas', '/despesas'],
  ['parcelas', '/parcelas'],
  ['sessoes', '/sessoes'],
  ['whatsapp', '/whatsapp'],
]

/**
 * Para onde vai quem entra (ou cai numa tela sem permissão). Era sempre `/dashboard`,
 * e o `PrivateRoute` devolvia para `/` quem não tinha essa permissão — que mandava de
 * volta para `/dashboard`: laço infinito (25/09/2026, usuária comum da Panteras sem
 * Dashboard, ~1.400 requisições por minuto). Sem nenhuma tela liberada sobra o
 * Suporte, que não depende de permissão.
 */
export const rotaInicial = (u?: PermissoesCarrier | null): string => {
  if (!u || isAdminEmpresa(u)) return '/dashboard'
  const p = (u.permissoes || {}) as Record<string, boolean | undefined>
  return TELAS_POR_PERMISSAO.find(([chave]) => p[chave] !== false)?.[1] ?? '/suporte'
}
