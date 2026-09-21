/**
 * Papéis dentro da empresa — fonte única de verdade da hierarquia.
 *
 *   comum   (0) → operação, limitada pelas permissões que o master define
 *   master  (1) → administra usuários e a operação
 *   creator (2) → tudo do master + ÚNICO que configura o agente de IA
 *
 * O super_admin é do SISTEMA (vem de `nivel`, não do tipo) e passa por cima de tudo.
 *
 * Quase todo lugar que checava `tipo_usuario === 'master'` queria dizer "administrador
 * da empresa" — creator também é, e precisa continuar entrando nesses lugares. Use
 * `isAdminEmpresa` neles e reserve `isCreator` para o que é exclusivo do dono.
 */

export type TipoUsuario = 'comum' | 'master' | 'creator';

export interface RoleCarrier {
  nivel?: string | null;
  tipo_usuario?: string | null;
}

const RANK: Record<string, number> = { comum: 0, master: 1, creator: 2 };

/** Posição na hierarquia da empresa (desconhecido = comum). */
export const rankTipo = (tipo?: string | null): number => RANK[tipo || 'comum'] ?? 0;

export const isSuperAdmin = (u?: RoleCarrier | null): boolean => u?.nivel === 'super_admin';

/** Dono da empresa: administra e é o único que mexe na configuração do agente de IA. */
export const isCreator = (u?: RoleCarrier | null): boolean => u?.tipo_usuario === 'creator';

/** Administra usuários e a operação da empresa (master ou creator). */
export const isAdminEmpresa = (u?: RoleCarrier | null): boolean =>
  isSuperAdmin(u) || u?.tipo_usuario === 'master' || u?.tipo_usuario === 'creator';

/** Pode configurar o agente de IA (prompt geral, tom, chave de API, modelo). */
export const podeConfigurarAgenteIA = (u?: RoleCarrier | null): boolean =>
  isSuperAdmin(u) || isCreator(u);

export const TIPOS_VALIDOS: TipoUsuario[] = ['comum', 'master', 'creator'];
