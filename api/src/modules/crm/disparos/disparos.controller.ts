import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../middlewares/auth.middleware';
import { disparosService } from './disparos.service';

export const disparosController = {
  async listarLeads(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const { funil_id, search, page, per_page, estagio_id, responsavel_id, temperatura, origem } = req.query;

      if (!funil_id) {
        return res.status(400).json({ message: 'funil_id é obrigatório' });
      }

      const result = await disparosService.listarLeads(
        empresaId,
        parseInt(funil_id as string),
        search as string | undefined,
        page ? parseInt(page as string) : 1,
        per_page ? parseInt(per_page as string) : 50,
        {
          estagio_id: estagio_id ? parseInt(estagio_id as string) : undefined,
          responsavel_id: responsavel_id ? parseInt(responsavel_id as string) : undefined,
          temperatura: temperatura as string | undefined,
          origem: origem as string | undefined,
        }
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async iniciar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const usuarioId = req.user!.id;
      const { lead_ids, todos, template, funil_id, estagio_pos_disparo_id, agendado_para,
              estagio_id, responsavel_id, temperatura, origem } = req.body;

      if (!template || !template.trim()) {
        return res.status(400).json({ message: 'template é obrigatório' });
      }

      if (todos) {
        if (!funil_id) {
          return res.status(400).json({ message: 'funil_id é obrigatório para disparo de todos' });
        }
      } else {
        if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
          return res.status(400).json({ message: 'lead_ids é obrigatório' });
        }
        if (lead_ids.length > 5000) {
          return res.status(400).json({ message: 'Máximo de 5000 leads por disparo' });
        }
      }

      const disparoId = await disparosService.iniciar(empresaId, usuarioId, {
        lead_ids: todos ? undefined : lead_ids,
        todos: todos || false,
        template: template.trim(),
        funil_id,
        estagio_pos_disparo_id: estagio_pos_disparo_id || undefined,
        agendado_para: agendado_para || undefined,
        estagio_id: estagio_id ? Number(estagio_id) : undefined,
        responsavel_id: responsavel_id ? Number(responsavel_id) : undefined,
        temperatura: temperatura || undefined,
        origem: origem || undefined,
      });

      res.json({ disparo_id: disparoId });
    } catch (error) {
      next(error);
    }
  },

  async getStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const disparoId = parseInt(req.params.id);

      const disparo = await disparosService.getStatus(disparoId, empresaId);
      if (!disparo) {
        return res.status(404).json({ message: 'Disparo não encontrado' });
      }
      res.json(disparo);
    } catch (error) {
      next(error);
    }
  },

  async listar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const disparos = await disparosService.listar(empresaId);
      res.json(disparos);
    } catch (error) {
      next(error);
    }
  },

  async listarAgendados(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const funilTipo = req.query.funil_tipo as 'aquisicao' | 'cx' | undefined;
      const disparos = await disparosService.listarAgendados(empresaId, funilTipo);
      res.json(disparos);
    } catch (error) {
      next(error);
    }
  },

  async cancelarAgendado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const id = parseInt(req.params.id);
      const result = await disparosService.cancelarAgendado(id, empresaId);
      if (!result) return res.status(404).json({ error: 'Disparo não encontrado ou já processado' });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async editarAgendado(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const empresaId = req.user!.empresa_id;
      const id = parseInt(req.params.id);
      const { template, agendado_para } = req.body;
      const result = await disparosService.editarAgendado(id, empresaId, { template, agendado_para });
      if (!result) return res.status(404).json({ error: 'Disparo não encontrado ou já processado' });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
