import { Response } from 'express';
import { parcelasService } from './parcelas.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const parcelasController = {
  async listReceitas(req: AuthRequest, res: Response) {
    try {
      const filters = {
        ...req.query,
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const result = await parcelasService.listReceitas(filters);
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ code: 'LIST_ERROR', message: error.message });
    }
  },

  async listDespesas(req: AuthRequest, res: Response) {
    try {
      const filters = {
        ...req.query,
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const result = await parcelasService.listDespesas(filters);
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ code: 'LIST_ERROR', message: error.message });
    }
  },

  async updateParcelaReceita(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const result = await parcelasService.updateParcelaReceita(
        req.params.id,
        req.body,
        filters
      );
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'UPDATE_ERROR', message: error.message });
    }
  },

  async updateParcelaDespesa(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const result = await parcelasService.updateParcelaDespesa(
        req.params.id,
        req.body,
        filters
      );
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'UPDATE_ERROR', message: error.message });
    }
  },

  async enviarEmailsCobranca(req: AuthRequest, res: Response) {
    try {
      const { parcela_ids } = req.body;

      if (!parcela_ids || !Array.isArray(parcela_ids) || parcela_ids.length === 0) {
        return res.status(400).json({
          code: 'INVALID_DATA',
          message: 'É necessário fornecer um array de IDs de parcelas'
        });
      }

      const result = await parcelasService.enviarEmailsCobrancaManuais(
        parcela_ids,
        req.user?.userId,
        req.user?.nivel,
        req.user?.empresa_id
      );

      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({
        code: 'EMAIL_ERROR',
        message: error.message
      });
    }
  },

  async enviarWhatsAppCobranca(req: AuthRequest, res: Response) {
    try {
      const { parcela_ids } = req.body;

      if (!parcela_ids || !Array.isArray(parcela_ids) || parcela_ids.length === 0) {
        return res.status(400).json({
          code: 'INVALID_DATA',
          message: 'É necessário fornecer um array de IDs de parcelas'
        });
      }

      const result = await parcelasService.enviarWhatsAppCobrancaManuais(
        parcela_ids,
        req.user?.userId,
        req.user?.nivel
      );

      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({
        code: 'WHATSAPP_ERROR',
        message: error.message
      });
    }
  }
};
