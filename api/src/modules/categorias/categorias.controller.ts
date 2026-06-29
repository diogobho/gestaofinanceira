import { Response } from 'express';
import { categoriasService } from './categorias.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const categoriasController = {
  // ============================================================================
  // CATEGORIAS RECEITAS
  // ============================================================================

  async listCategoriasReceitas(req: AuthRequest, res: Response) {
    try {
      const result = await categoriasService.listCategoriasReceitas(
        req.user?.userId!,
        req.user?.nivel
      );
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ code: 'ERROR', message: error.message });
    }
  },

  async getCategoriaReceita(req: AuthRequest, res: Response) {
    try {
      const result = await categoriasService.getCategoriaReceita(
        req.params.id,
        req.user?.userId!,
        req.user?.nivel
      );
      return res.json(result);
    } catch (error: any) {
      return res.status(404).json({ code: 'NOT_FOUND', message: error.message });
    }
  },

  async createCategoriaReceita(req: AuthRequest, res: Response) {
    try {
      const result = await categoriasService.createCategoriaReceita(
        req.body,
        req.user?.userId!
      );
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'CREATE_ERROR', message: error.message });
    }
  },

  async updateCategoriaReceita(req: AuthRequest, res: Response) {
    try {
      const result = await categoriasService.updateCategoriaReceita(
        req.params.id,
        req.body,
        req.user?.userId!,
        req.user?.nivel
      );
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'UPDATE_ERROR', message: error.message });
    }
  },

  async deleteCategoriaReceita(req: AuthRequest, res: Response) {
    try {
      await categoriasService.deleteCategoriaReceita(
        req.params.id,
        req.user?.userId!,
        req.user?.nivel
      );
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ code: 'DELETE_ERROR', message: error.message });
    }
  },

  // ============================================================================
  // CATEGORIAS DESPESAS
  // ============================================================================

  async listCategoriasDespesas(req: AuthRequest, res: Response) {
    try {
      const result = await categoriasService.listCategoriasDespesas(
        req.user?.userId!,
        req.user?.nivel
      );
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ code: 'ERROR', message: error.message });
    }
  },

  async getCategoriaDespesa(req: AuthRequest, res: Response) {
    try {
      const result = await categoriasService.getCategoriaDespesa(
        req.params.id,
        req.user?.userId!,
        req.user?.nivel
      );
      return res.json(result);
    } catch (error: any) {
      return res.status(404).json({ code: 'NOT_FOUND', message: error.message });
    }
  },

  async createCategoriaDespesa(req: AuthRequest, res: Response) {
    try {
      const result = await categoriasService.createCategoriaDespesa(
        req.body,
        req.user?.userId!
      );
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'CREATE_ERROR', message: error.message });
    }
  },

  async updateCategoriaDespesa(req: AuthRequest, res: Response) {
    try {
      const result = await categoriasService.updateCategoriaDespesa(
        req.params.id,
        req.body,
        req.user?.userId!,
        req.user?.nivel
      );
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'UPDATE_ERROR', message: error.message });
    }
  },

  async deleteCategoriaDespesa(req: AuthRequest, res: Response) {
    try {
      await categoriasService.deleteCategoriaDespesa(
        req.params.id,
        req.user?.userId!,
        req.user?.nivel
      );
      return res.status(204).send();
    } catch (error: any) {
      return res.status(400).json({ code: 'DELETE_ERROR', message: error.message });
    }
  }
};
