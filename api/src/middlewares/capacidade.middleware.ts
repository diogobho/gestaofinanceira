/**
 * Guard de rota por capacidade do plano.
 *
 * Mora aqui e não no `checkSubscription` por um motivo prático: o
 * `checkSubscription` é montado em `server.ts` ANTES do `authRequired` de cada
 * módulo, então `req.user` chega vazio nele e ele libera todo mundo (é por isso
 * que trial vencido não bloqueia nada hoje). Guard de plano só funciona depois da
 * autenticação — por isso ele é aplicado DENTRO de cada router, abaixo do
 * `authMiddleware`, como o `empresaRequired` já é.
 *
 * `super_admin` passa por cima: ele é do sistema, não de uma empresa, e é quem
 * atende o suporte de todas elas.
 */

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { Capacidade, temCapacidade, recusa } from '../shared/capacidades';

export function exigirCapacidade(cap: Capacidade) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user?.nivel === 'super_admin') return next();

      const empresaId = req.user?.empresa_id;
      // Sem empresa no token não é caso de plano — quem trata é o empresaRequired.
      if (!empresaId) return next();

      if (await temCapacidade(empresaId, cap)) return next();
      return res.status(403).json(recusa(cap));
    } catch (err: any) {
      // Falha ao LER a capacidade não pode virar bloqueio: derrubaria o CRM inteiro
      // por causa de um hiccup do banco. Erra para o lado de deixar passar, como o
      // checkSubscription já faz, e deixa rastro.
      console.error('[capacidade]', cap, err?.message);
      next();
    }
  };
}
