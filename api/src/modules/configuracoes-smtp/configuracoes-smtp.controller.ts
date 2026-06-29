import { Response } from 'express';
import { configuracoesSmtpService } from './configuracoes-smtp.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const configuracoesSmtpController = {
  async get(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Não autenticado' });
      const config = await configuracoesSmtpService.getByEmpresa(req.user.empresa_id);
      return res.json(config || null);
    } catch (error: any) {
      return res.status(500).json({ code: 'GET_ERROR', message: error.message });
    }
  },

  async upsert(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Não autenticado' });
      const { smtp_host, smtp_port, smtp_user, smtp_pass, email_from, email_from_name, ativo } = req.body;

      if (!smtp_user || !email_from) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'smtp_user e email_from são obrigatórios.' });
      }

      const config = await configuracoesSmtpService.upsert(req.user.empresa_id, {
        smtp_host,
        smtp_port: smtp_port ? Number(smtp_port) : 587,
        smtp_user,
        smtp_pass,
        email_from,
        email_from_name,
        ativo,
      });

      return res.json(config);
    } catch (error: any) {
      return res.status(400).json({ code: 'UPSERT_ERROR', message: error.message });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Não autenticado' });
      await configuracoesSmtpService.delete(req.user.empresa_id);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ code: 'DELETE_ERROR', message: error.message });
    }
  },

  async testar(req: AuthRequest, res: Response) {
    try {
      if (!req.user) return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Não autenticado' });
      const { email_destino } = req.body;
      if (!email_destino) {
        return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'email_destino é obrigatório.' });
      }
      await configuracoesSmtpService.testar(req.user.empresa_id, email_destino);
      return res.json({ success: true, message: `E-mail de teste enviado para ${email_destino}` });
    } catch (error: any) {
      return res.status(400).json({ code: 'TEST_ERROR', message: error.message });
    }
  },
};
