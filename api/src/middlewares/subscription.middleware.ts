import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { verifyAccessToken } from '../config/jwt';
import { bloqueioDaEmpresa } from '../modules/assinaturas/assinaturas.service';

// Rotas que não precisam de assinatura ativa. É o que a Minha Conta e a escolha de
// plano usam — o caminho de volta de quem está bloqueado não pode estar bloqueado.
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

const MENSAGEM: Record<string, string> = {
  trial_encerrado: 'O seu teste grátis terminou. Escolha um plano em Minha Conta para continuar.',
  suspensa: 'O acesso da conta está pausado. Escolha um plano em Minha Conta para continuar.',
  aguardando_pagamento: 'Estamos aguardando a confirmação do pagamento. O acesso volta assim que ele for confirmado.',
};

function isRotaLiberada(path: string): boolean {
  return ROTAS_LIBERADAS.some(rota => path.startsWith(rota));
}

/**
 * Conta sem acesso: trial encerrado, suspensa ou aguardando pagamento (25/09/2026).
 *
 * Montado em `server.ts` ANTES do `authRequired` de cada módulo, então `req.user`
 * chega vazio aqui — e até esta data ele liberava todo mundo por isso: trial vencido
 * usava o sistema inteiro. Agora o próprio guard lê o token. Token ausente ou
 * inválido segue adiante sem decisão: webhook público não tem token, e quem responde
 * 401 é o `authRequired` do módulo.
 *
 * Cancelada e expirada NÃO são barradas aqui (a tela já as bloqueia): a conta
 * institucional (empresa 1) está `cancelada` e vive de cortesia (migration 083), e
 * ligar essa regra na API a derrubaria junto. Ver `bloqueioDaEmpresa`.
 */
export const checkSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (isRotaLiberada(req.path)) return next();

    let user = req.user;
    if (!user) {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) return next();
      try {
        user = verifyAccessToken(auth.substring(7));
      } catch {
        return next();
      }
    }

    // super_admin não está preso a nenhuma empresa/plano
    if (user.nivel === 'super_admin') return next();

    const empresaId = user.empresa_id;
    if (!empresaId) return next();

    const bloqueio = await bloqueioDaEmpresa(empresaId);
    if (bloqueio) {
      return res.status(402).json({
        code: bloqueio === 'trial_encerrado' ? 'TRIAL_ENCERRADO' : 'CONTA_BLOQUEADA',
        status: bloqueio,
        message: MENSAGEM[bloqueio],
      });
    }

    next();
  } catch (error: any) {
    // Falha ao LER a assinatura não vira bloqueio: um hiccup do banco não pode
    // derrubar o sistema de todos os clientes.
    console.error('[checkSubscription]', error.message);
    next();
  }
};
