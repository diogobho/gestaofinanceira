import { Request, Response } from 'express';
import { tarefasService, CreateTarefaDto, UpdateTarefaDto } from './tarefas.service';

export const tarefasController = {
  async listByLead(req: Request, res: Response) {
    try {
      const leadId = parseInt(req.params.leadId);
      const empresaId = (req as any).user.empresa_id;

      const tarefas = await tarefasService.listByLead(leadId, empresaId);

      // Adicionar status visual
      const tarefasComStatus = tarefas.map(t => ({
        ...t,
        status_visual: tarefasService.getStatusVisual(t)
      }));

      res.json(tarefasComStatus);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async listByEmpresa(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const { responsavel_id, status, data_inicio, data_fim, funil_tipo } = req.query;

      const tarefas = await tarefasService.listByEmpresa(empresaId, {
        responsavel_id: responsavel_id ? parseInt(responsavel_id as string) : undefined,
        status: status as string,
        data_inicio: data_inicio ? new Date(data_inicio as string) : undefined,
        data_fim: data_fim ? new Date(data_fim as string) : undefined,
        funil_tipo: funil_tipo as 'aquisicao' | 'cx' | undefined
      });

      const tarefasComStatus = tarefas.map(t => ({
        ...t,
        status_visual: tarefasService.getStatusVisual(t)
      }));

      res.json(tarefasComStatus);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async getById(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const empresaId = (req as any).user.empresa_id;

      const tarefa = await tarefasService.getById(id, empresaId);

      if (!tarefa) {
        return res.status(404).json({ error: 'Tarefa não encontrada' });
      }

      res.json({
        ...tarefa,
        status_visual: tarefasService.getStatusVisual(tarefa)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async create(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;
      const data: CreateTarefaDto = req.body;

      const tarefa = await tarefasService.create(empresaId, usuarioId, data);

      res.status(201).json({
        ...tarefa,
        status_visual: tarefasService.getStatusVisual(tarefa)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const empresaId = (req as any).user.empresa_id;
      const data: UpdateTarefaDto = req.body;

      const tarefa = await tarefasService.update(id, empresaId, data);

      if (!tarefa) {
        return res.status(404).json({ error: 'Tarefa não encontrada' });
      }

      res.json({
        ...tarefa,
        status_visual: tarefasService.getStatusVisual(tarefa)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async delete(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const empresaId = (req as any).user.empresa_id;

      const deleted = await tarefasService.delete(id, empresaId);

      if (!deleted) {
        return res.status(404).json({ error: 'Tarefa não encontrada' });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },

  async concluir(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id);
      const empresaId = (req as any).user.empresa_id;
      const usuarioId = (req as any).user.id;

      const tarefa = await tarefasService.concluir(id, empresaId, usuarioId);

      if (!tarefa) {
        return res.status(404).json({ error: 'Tarefa não encontrada' });
      }

      res.json({
        ...tarefa,
        status_visual: tarefasService.getStatusVisual(tarefa)
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
};
