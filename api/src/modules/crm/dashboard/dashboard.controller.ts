import { Response, NextFunction } from 'express';
import { dashboardService, normalizarGranularidade } from './dashboard.service';
import { AuthRequest } from '../../../middlewares/auth.middleware';
import { getProdutividade, mesCorrente } from './produtividade';

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
      // Valor inválido cai em 'mes' — a granularidade entra em interpolação de
      // SQL, então só os quatro nomes conhecidos podem passar daqui.
      const granularidade = normalizarGranularidade(req.query.granularidade);

      const metricas = await dashboardService.getMetricas(empresaId, funilId, dataInicio, dataFim, responsavelId, granularidade);
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
  },

  async getProdutividade(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const funilId = req.query.funil_id ? parseInt(req.query.funil_id as string) : NaN;
      // As etapas de reunião/oferta são achadas pelo nome DENTRO de um funil.
      if (!Number.isInteger(funilId) || funilId <= 0) {
        return res.status(400).json({ error: 'Escolha um funil para ver a produtividade.' });
      }
      const mes = mesCorrente();
      const inicio = parseDate(req.query.data_inicio as string | undefined) || mes.inicio;
      const fim = parseDate(req.query.data_fim as string | undefined) || mes.fim;
      const responsavelId = req.query.responsavel_id ? parseInt(req.query.responsavel_id as string) : undefined;
      res.json(await getProdutividade(empresaId, funilId, inicio, fim, responsavelId));
    } catch (error) {
      next(error);
    }
  }
};
