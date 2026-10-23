import { isAdminEmpresa, isSuperAdmin, type RoleCarrier } from './roles';

/**
 * Quem enxerga quais lançamentos financeiros (receitas, despesas, parcelas,
 * dashboard).
 *
 *   super_admin      → tudo
 *   master / creator → todos os lançamentos da PRÓPRIA empresa (decisão do dono,
 *                      08/10/2026: o administrador vê o financeiro inteiro)
 *   comum            → só o que ele mesmo lançou
 *
 * Vale para ler e para editar/dar baixa/excluir: a tela que mostra o lançamento
 * de um colega oferece os mesmos botões, e eles não podem responder "não
 * encontrado". O INSERT continua gravando o `usuario_id` de quem lançou.
 */
export interface FiltroDono extends RoleCarrier {
  usuario_id?: number | null;
  empresa_id?: number | null;
}

/**
 * Trecho `AND …` para o WHERE, já empurrando o parâmetro em `params` (numerado
 * pelo array, nunca `$n` chumbado). `coluna` é a coluna `usuario_id` da tabela
 * do lançamento, com o alias da consulta (`r.usuario_id`, `d.usuario_id`).
 */
export function escopoDono(filters: FiltroDono | undefined | null, params: any[], coluna: string): string {
  if (!filters?.usuario_id || isSuperAdmin(filters)) return '';
  if (isAdminEmpresa(filters) && filters.empresa_id) {
    params.push(filters.empresa_id);
    return ` AND ${coluna} IN (SELECT id FROM usuarios WHERE empresa_id = $${params.length})`;
  }
  params.push(filters.usuario_id);
  return ` AND ${coluna} = $${params.length}`;
}

/** Os campos do token que `escopoDono` precisa. */
export const filtroDoUsuario = (u?: { userId?: number; nivel?: string; tipo_usuario?: string; empresa_id?: number } | null): FiltroDono => ({
  usuario_id: u?.userId,
  nivel: u?.nivel,
  tipo_usuario: u?.tipo_usuario,
  empresa_id: u?.empresa_id,
});
