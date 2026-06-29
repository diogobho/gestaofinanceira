import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { assinaturasService } from '../modules/assinaturas/assinaturas.service';

// Rotas que não precisam de assinatura ativa
const ROTAS_LIBERADAS = [
  '/api/auth',
  '/api/gestao/auth',
  '/api/planos',
  '/api/gestao/planos',
  '/api/assinaturas',
  '/api/gestao/assinaturas',
  '/api/webhook',
  '/api/gestao/webhook',
  '/api/health',
  '/api/docs',
];

function isRotaLiberada(path: string): boolean {
  return ROTAS_LIBERADAS.some(rota => path.startsWith(rota));
}

export const checkSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Rotas liberadas não precisam de verificação
    if (isRotaLiberada(req.path)) return next();

    // Sem usuário autenticado → deixar o authRequired tratar
    if (!req.user) return next();

    // super_admin não está preso a nenhuma empresa/plano
    if (req.user.nivel === 'super_admin') return next();

    // Usuário sem empresa → bloquear
    const empresaId = req.user.empresa_id;
    if (!empresaId) return next(); // deixa passar, outros middlewares tratam

    const resultado = await assinaturasService.isAtiva(empresaId);

    if (!resultado.ativa) {
      return res.status(402).json({
        code: 'SUBSCRIPTION_REQUIRED',
        status: resultado.status,
        message: resultado.motivo || 'Assinatura necessária para acessar este recurso.',
      });
    }

    next();
  } catch (error: any) {
    // Em caso de erro interno, permitir acesso para não bloquear usuários indevidamente
    console.error('[checkSubscription]', error.message);
    next();
  }
};
