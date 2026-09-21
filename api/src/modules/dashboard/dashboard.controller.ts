import { Response } from 'express';
import { dashboardService } from './dashboard.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const dashboardController = {
  async getDashboardData(req: AuthRequest, res: Response) {
    try {
      /*
        `...req.query` cru ia direto para o SQL como parâmetro de data. Qualquer
        lixo na URL (`data_ini=abc`, `data_fim=2026-13-45`) virava 500 e o
        dashboard inteiro sumia — e a query string é a parte da requisição mais
        fácil de alguém alterar. Só YYYY-MM-DD passa; o resto é ignorado, que é
        o mesmo que não ter filtrado.
      */
      const dataValida = (v: unknown): string | undefined => {
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
        const d = new Date(`${v}T00:00:00Z`);
        return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
      };

      const filters = {
        data_ini: dataValida(req.query.data_ini),
        data_fim: dataValida(req.query.data_fim),
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };

      const data = await dashboardService.getDashboardData(filters);
      return res.json(data);
    } catch (error: any) {
      return res.status(500).json({
        code: 'DASHBOARD_ERROR',
        message: error.message
      });
    }
  }
};
