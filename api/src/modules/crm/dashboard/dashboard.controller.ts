import { Response, NextFunction } from 'express';
import { dashboardService } from './dashboard.service';
import { AuthRequest } from '../../../middlewares/auth.middleware';

function parseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  // Aceita YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Aceita dd/mm/yy ou dd/mm/yyyy
  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m}-${d}`;
  }
  return undefined;
}

export const dashboardController = {
  async getMetricas(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const funilId = req.query.funil_id ? parseInt(req.query.funil_id as string) : undefined;
      const dataInicio = parseDate(req.query.data_inicio as string | undefined);
      const dataFim = parseDate(req.query.data_fim as string | undefined);
      const responsavelId = req.query.responsavel_id ? parseInt(req.query.responsavel_id as string) : undefined;

      const metricas = await dashboardService.getMetricas(empresaId, funilId, dataInicio, dataFim, responsavelId);
      res.json(metricas);
    } catch (error) {
      next(error);
    }
  },

  async getFunilAnalytics(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const funilId = req.query.funil_id ? parseInt(req.query.funil_id as string) : undefined;
      const dias = req.query.dias ? parseInt(req.query.dias as string) : 30;
      const dataInicio = parseDate(req.query.data_inicio as string | undefined);
      const dataFim = parseDate(req.query.data_fim as string | undefined);
      const responsavelId = req.query.responsavel_id ? parseInt(req.query.responsavel_id as string) : undefined;

      const analytics = await dashboardService.getFunilAnalytics(empresaId, funilId, dias, dataInicio, dataFim, responsavelId);
      res.json(analytics);
    } catch (error) {
      next(error);
    }
  }
};
