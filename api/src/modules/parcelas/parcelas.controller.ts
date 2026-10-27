import { Response } from 'express';
import { parcelasService } from './parcelas.service';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { filtroDoUsuario } from '../../shared/escopoFinanceiro';

export const parcelasController = {
  async listReceitas(req: AuthRequest, res: Response) {
    try {
      const filters = {
        ...req.query,
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel,
        tipo_usuario: req.user?.tipo_usuario,
        empresa_id: req.user?.empresa_id
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
        nivel: req.user?.nivel,
        tipo_usuario: req.user?.tipo_usuario,
        empresa_id: req.user?.empresa_id
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
        nivel: req.user?.nivel,
        tipo_usuario: req.user?.tipo_usuario,
        empresa_id: req.user?.empresa_id
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
        nivel: req.user?.nivel,
        tipo_usuario: req.user?.tipo_usuario,
        empresa_id: req.user?.empresa_id
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

  async excluirParcela(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel,
        tipo_usuario: req.user?.tipo_usuario,
        empresa_id: req.user?.empresa_id
      };
      const tipo = req.params.tipo === 'receitas' ? 'receitas' : 'despesas';
      const result = await parcelasService.excluirParcela(tipo, req.params.id, filters);
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'DELETE_ERROR', message: error.message });
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
        filtroDoUsuario(req.user),
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
        filtroDoUsuario(req.user)
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
