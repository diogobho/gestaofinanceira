import { Request, Response } from 'express';
import { followupsService } from './followups.service';

export const followupsController = {
  async criar(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const usuarioId = (req as any).user?.id;
      const leadId = parseInt(req.params.leadId);
      const { agendado_para, tipo, mensagem, instrucao_ia, hora_inicio, hora_fim, dias_semana } = req.body;

      if (!agendado_para || !tipo) {
        return res.status(400).json({ error: 'agendado_para e tipo são obrigatórios' });
      }
      if (tipo === 'manual' && !mensagem) {
        return res.status(400).json({ error: 'mensagem é obrigatória para tipo manual' });
      }
      if (!['manual', 'agente_ia'].includes(tipo)) {
        return res.status(400).json({ error: 'tipo deve ser manual ou agente_ia' });
      }

      const followup = await followupsService.criar(
        leadId, usuarioId, empresaId, agendado_para, tipo,
        mensagem, instrucao_ia, 'lead',
        hora_inicio, hora_fim, dias_semana
      );
      return res.status(201).json(followup);
    } catch (err: any) {
      console.error('Erro ao criar follow-up:', err);
      return res.status(500).json({ error: 'Erro ao criar follow-up' });
    }
  },

  async listar(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const leadId = parseInt(req.params.leadId);
      const followups = await followupsService.listarPorLead(leadId, empresaId);
      return res.json(followups);
    } catch (err: any) {
      console.error('Erro ao listar follow-ups:', err);
      return res.status(500).json({ error: 'Erro ao listar follow-ups' });
    }
  },

  async listarTodos(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const filtro = (req.query.filtro as 'hoje' | 'semana' | 'atrasados' | 'todos') || 'hoje';
      const status = req.query.status as string | undefined;
      const funilTipo = req.query.funil_tipo as 'aquisicao' | 'cx' | undefined;
      const followups = await followupsService.listarTodos(empresaId, filtro, status, funilTipo);
      return res.json(followups);
    } catch (err: any) {
      console.error('Erro ao listar todos follow-ups:', err);
      return res.status(500).json({ error: 'Erro ao listar follow-ups' });
    }
  },

  async cancelar(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const id = parseInt(req.params.id);
      const followup = await followupsService.cancelar(id, empresaId);
      if (!followup) return res.status(404).json({ error: 'Follow-up não encontrado ou já processado' });
      return res.json(followup);
    } catch (err: any) {
      console.error('Erro ao cancelar follow-up:', err);
      return res.status(500).json({ error: 'Erro ao cancelar follow-up' });
    }
  },

  async reagendar(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const id = parseInt(req.params.id);
      const { agendado_para } = req.body;
      if (!agendado_para) {
        return res.status(400).json({ error: 'agendado_para é obrigatório' });
      }
      const followup = await followupsService.reagendar(id, empresaId, agendado_para);
      if (!followup) return res.status(404).json({ error: 'Follow-up não encontrado ou não pode ser reagendado' });
      return res.json(followup);
    } catch (err: any) {
      console.error('Erro ao reagendar follow-up:', err);
      return res.status(500).json({ error: 'Erro ao reagendar follow-up' });
    }
  },

  async metricas(req: Request, res: Response) {
    try {
      const empresaId = (req as any).user?.empresa_id;
      const dados = await followupsService.metricas(empresaId);
      return res.json(dados);
    } catch (err: any) {
      console.error('Erro ao buscar métricas de follow-ups:', err);
      return res.status(500).json({ error: 'Erro ao buscar métricas' });
    }
  },
};
