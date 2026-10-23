import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { verifyAccessToken } from '../config/jwt';
import type { AuthRequest } from '../middlewares/auth.middleware';
import { isAdminEmpresa, type RoleCarrier } from './roles';

/**
 * Permissões por módulo que o master marca para cada usuário comum
 * (`usuarios.permissoes`: dashboard, crm, clientes, receitas, despesas, parcelas,
 * sessoes, whatsapp, agente). Master, creator e super_admin têm todas.
 *
 * Mesma regra do frontend (`PrivateRoute`): só nega o que está explicitamente
 * `false` — usuário antigo, sem a chave, continua entrando.
 *
 * Até 21/10/2026 isso só escondia o menu: a API não conferia. Desde então o
 * servidor confere (`exigePermissao`) e o chat do Duo também, antes de cada ação.
 */
export interface PermissoesCarrier extends RoleCarrier {
  permissoes?: Record<string, boolean> | null;
}

export const temPermissao = (u: PermissoesCarrier | null | undefined, modulo: string): boolean => {
  if (!u) return false;
  if (isAdminEmpresa(u)) return true;
  return (u.permissoes || {})[modulo] !== false;
};

// O JWT vale 8h e carrega as permissões do login: tirar um módulo de alguém só
// valeria no próximo login. Lemos do banco, com um cache curto por instância.
const CACHE_MS = 30_000;
const cache = new Map<number, { em: number; u: PermissoesCarrier | null }>();

export async function permissoesAtuais(usuarioId: number): Promise<PermissoesCarrier | null> {
  const c = cache.get(usuarioId);
  if (c && Date.now() - c.em < CACHE_MS) return c.u;
  const r = await query(
    `SELECT nivel, tipo_usuario, permissoes FROM usuarios WHERE id = $1 AND ativo`,
    [usuarioId]
  );
  const u = r.rows[0] || null;
  cache.set(usuarioId, { em: Date.now(), u });
  return u;
}

/**
 * Barra o módulo inteiro na montagem da rota (`app.use(prefixo, exigePermissao(...), rotas)`).
 *
 * `leitura` é a lista de módulos que liberam GET — basta um. Telas leem dados de
 * outros módulos (o Dashboard lê parcelas e clientes; Receitas lê clientes para o
 * seletor), então a leitura costuma aceitar mais de um. `escrita` vale para o resto
 * (POST/PUT/PATCH/DELETE) e, se omitida, é igual à leitura.
 *
 * Roda antes do `authRequired` de dentro do router, então decodifica o token por
 * conta própria. Sem token (ou inválido), segue: quem barra é a autenticação da
 * rota, e rota pública montada no mesmo prefixo continua pública.
 */
export const exigePermissao = (leitura: string[], escrita: string[] = leitura) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    let user = req.user;
    if (!user) {
      const h = req.headers.authorization;
      if (!h || !h.startsWith('Bearer ')) return next();
      try { user = verifyAccessToken(h.substring(7)); } catch { return next(); }
    }

    const modulos = req.method === 'GET' || req.method === 'HEAD' ? leitura : escrita;
    let atual: PermissoesCarrier | null = user;
    try {
      atual = await permissoesAtuais(Number(user.userId ?? user.id));
    } catch {
      // Banco fora: fica com o que veio no login, em vez de derrubar a tela.
    }
    if (atual && modulos.some(m => temPermissao(atual, m))) return next();
    return res.status(403).json({
      code: 'SEM_PERMISSAO',
      message: 'Você não tem acesso a este módulo. Peça ao administrador da empresa.',
    });
  };
