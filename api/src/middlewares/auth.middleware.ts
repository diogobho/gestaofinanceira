import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, JwtPayload } from '../config/jwt';

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

// Middleware para verificar se o usuário é MASTER na empresa (ou super_admin)
export const masterOnly = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
    }

    // Admin (super_admin) tem acesso total
    if (req.user.nivel === 'super_admin') {
      return next();
    }

    if (req.user.tipo_usuario !== 'master') {
      return res.status(403).json({
        code: 'FORBIDDEN',
        message: 'Acesso negado. Apenas usuários master podem acessar este recurso.'
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
