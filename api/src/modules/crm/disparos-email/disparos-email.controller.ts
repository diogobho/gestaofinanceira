import { Response } from 'express';
import { AuthRequest } from '../../../middlewares/auth.middleware';
import { disparosEmailService } from './disparos-email.service';

export const disparosEmailController = {
  async listarLeads(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user!.empresa_id!;
      const { funil_id, search, page, per_page, estagio_id, responsavel_id, temperatura, origem } = req.query;
      if (!funil_id) return res.status(400).json({ error: 'funil_id é obrigatório' });
      const result = await disparosEmailService.listarLeads(
        empresaId,
        Number(funil_id),
        search as string,
        Number(page) || 1,
        Number(per_page) || 50,
        {
          estagio_id: estagio_id ? parseInt(estagio_id as string) : undefined,
          responsavel_id: responsavel_id ? parseInt(responsavel_id as string) : undefined,
          temperatura: temperatura as string | undefined,
          origem: origem as string | undefined,
        }
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  async iniciar(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user!.empresa_id!;
      const usuarioId = req.user!.userId!;
      const { assunto, template, funil_id, todos, estagio_pos_disparo_id, agendado_para,
              estagio_id, responsavel_id, temperatura, origem } = req.body;

      if (!assunto || !template) {
        return res.status(400).json({ error: 'assunto e template são obrigatórios' });
      }

      // lead_ids pode chegar como string JSON quando enviado via FormData
      let lead_ids: number[] | undefined;
      if (req.body.lead_ids) {
        lead_ids = typeof req.body.lead_ids === 'string'
          ? JSON.parse(req.body.lead_ids)
          : req.body.lead_ids;
      }

      // Arquivos anexados (multer popula req.files)
      const files = req.files as Express.Multer.File[] | undefined;
      const anexos = files?.map(f => ({ filename: f.originalname, path: f.path }));

      const disparoId = await disparosEmailService.iniciar(empresaId, usuarioId, {
        lead_ids,
        todos: todos === 'true' || todos === true,
        funil_id: funil_id ? Number(funil_id) : undefined,
        assunto,
        template,
        anexos,
        estagio_pos_disparo_id: estagio_pos_disparo_id ? Number(estagio_pos_disparo_id) : undefined,
        agendado_para: agendado_para || undefined,
        estagio_id: estagio_id ? Number(estagio_id) : undefined,
        responsavel_id: responsavel_id ? Number(responsavel_id) : undefined,
        temperatura: temperatura || undefined,
        origem: origem || undefined,
      });

      res.json({ disparo_id: disparoId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  async getStatus(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user!.empresa_id!;
      const result = await disparosEmailService.getStatus(Number(req.params.id), empresaId);
      if (!result) return res.status(404).json({ error: 'Disparo não encontrado' });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },

  async listar(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user!.empresa_id!;
      const result = await disparosEmailService.listar(empresaId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
};
