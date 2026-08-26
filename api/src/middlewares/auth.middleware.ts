import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../config/jwt';
import { isAdminEmpresa } from '../shared/roles';

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const authRequired = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Token não fornecido' });
    }
    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);
    req.user = payload;
    next();
  } catch (error: any) {
    return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Token inválido ou expirado' });
  }
};

/**
 * Autentica aceitando o token no header (XHR) OU em `?t=` (query).
 *
 * Existe para UM caso: recurso carregado por tag nativa do navegador — `<img>`,
 * `<audio>`, `<video>`, ou um link que abre em nova aba. Essas requisições não
 * passam pelo axios e não mandam `Authorization`, e o JWT deste app vive no
 * localStorage, não em cookie: não há nada que o navegador anexe sozinho.
 *
 * Use SÓ em rota de download de arquivo. Para API normal, `authRequired` — token em
 * query aparece no access log, e não há motivo para pagar isso onde o header serve.
 *
 * Dívida conhecida: o passo seguinte é URL assinada de curta duração (HMAC +
 * expiração), que tira o token da query de vez.
 */
export const authRequiredOuTokenNaQuery = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.headers.authorization) return authRequired(req, res, next);
  const t = (req.query as any)?.t;
  if (typeof t !== 'string' || !t) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Token não fornecido' });
  }
  try {
    req.user = verifyAccessToken(t);
    return next();
  } catch {
    return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Token inválido ou expirado' });
  }
};

// Alias para compatibilidade
export const authMiddleware = authRequired;

// Middleware para verificar se o usuário é ADMIN (super_admin ou admin_empresa)
export const adminOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
    }

    if (req.user.nivel !== 'super_admin' && req.user.nivel !== 'admin_empresa') {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Acesso negado. Apenas administradores podem acessar este recurso.'
      });
    }

    next();
  } catch (error: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro ao verificar permissões' });
  }
};

// Middleware para verificar se o usuário administra a empresa — master, creator
// (o dono, que fica acima do master) ou super_admin.
export const masterOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
    }

    if (!isAdminEmpresa(req.user)) {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Acesso negado. Apenas usuários master ou creator podem acessar este recurso.'
      });
    }

    next();
  } catch (error: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro ao verificar permissões' });
  }
};

// Middleware para verificar se usuário tem empresa_id
export const empresaRequired = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
    }

    if (!req.user.empresa_id) {
      return res.status(403).json({
        code: 'NO_EMPRESA',
        message: 'Usuário não está vinculado a nenhuma empresa.'
      });
    }

    next();
  } catch (error: any) {
    return res.status(500).json({ code: 'SERVER_ERROR', message: 'Erro ao verificar empresa' });
  }
};
