import { Response, NextFunction } from 'express';
import { integracoesService } from './integracoes.service';
import { AuthRequest } from '../../../middlewares/auth.middleware';

export const integracoesController = {
  /**
   * Aberto a qualquer usuário com acesso ao CRM — pedir o número das próprias
   * captações não depende de papel. O recorte é sempre a empresa do token, então
   * cada conta enxerga só as integrações dela.
   */
  async getDashboard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dados = await integracoesService.getDashboard(req.user!.empresa_id);
      res.json(dados);
    } catch (error) {
      next(error);
    }
  },
};
