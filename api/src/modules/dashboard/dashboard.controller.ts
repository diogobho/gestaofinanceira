import { Response } from 'express';
import { dashboardService } from './dashboard.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const dashboardController = {
  async getDashboardData(req: AuthRequest, res: Response) {
    try {
      const filters = {
        ...req.query,
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
