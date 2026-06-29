import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from './env';

export interface JwtPayload {
  userId: number;
  id: number; // Alias para compatibilidade
  email: string;
  nivel: 'super_admin' | 'admin_empresa' | 'usuario';
  empresa_id: number;
  tipo_usuario: 'master' | 'comum';
  permissoes?: Record<string, boolean>;
}

export const signAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRY
  } as any);
};

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
};
