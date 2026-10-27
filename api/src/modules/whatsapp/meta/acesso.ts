/**
 * Quem pode usar o painel da Cloud API — a conta Meta da DUOFUTURO, um único token
 * de System User que não pertence a nenhuma empresa cliente.
 *
 * Por padrão, só o `super_admin`. `META_PAINEL_REVISORES` (ids de usuário separados
 * por vírgula) abre o painel para contas avulsas: hoje, a do analista do App Review
 * da Meta, presa a uma empresa só de demonstração. Entregar o login de super_admin
 * a quem é de fora exporia o dado de todas as empresas do banco.
 *
 * Lido a cada chamada, e não no boot: tirar o id do .env e reiniciar fecha o acesso.
 */
export function podeUsarCloudApi(user?: { id?: number; nivel?: string } | null): boolean {
  if (!user) return false;
  if (user.nivel === 'super_admin') return true;

  const revisores = (process.env.META_PAINEL_REVISORES || '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(n => Number.isInteger(n) && n > 0);

  return user.id !== undefined && revisores.includes(Number(user.id));
}
