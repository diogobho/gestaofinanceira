import { Response } from 'express';
import { clientesService } from './clientes.service';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { enviarEmail } from '../../services/email.service';
import { configuracoesSmtpService } from '../configuracoes-smtp/configuracoes-smtp.service';
import { query } from '../../config/database';

export const clientesController = {
  async list(req: AuthRequest, res: Response) {
    try {
      // Multi-tenancy: passar usuario_id e funcao para filtrar dados
      const filters = {
        ...req.query,
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const result = await clientesService.list(filters);
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ code: 'LIST_ERROR', message: error.message });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const cliente = await clientesService.getById(req.params.id, filters);
      return res.json(cliente);
    } catch (error: any) {
      return res.status(404).json({ code: 'NOT_FOUND', message: 'Cliente não encontrado' });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      // Multi-tenancy: adicionar usuario_id automaticamente
      const data = {
        ...req.body,
        usuario_id: req.user?.userId
      };
      const cliente = await clientesService.create(data);
      return res.status(201).json(cliente);
    } catch (error: any) {
      return res.status(400).json({ code: 'CREATE_ERROR', message: error.message });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const cliente = await clientesService.update(req.params.id, req.body, filters);
      return res.json(cliente);
    } catch (error: any) {
      return res.status(400).json({ code: 'UPDATE_ERROR', message: error.message });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const result = await clientesService.delete(req.params.id, filters);
      return res.json(result);
    } catch (error: any) {
      return res.status(404).json({ code: 'DELETE_ERROR', message: error.message });
    }
  },

  async notificarWhatsApp(req: AuthRequest, res: Response) {
    try {
      const filters = {
        usuario_id: req.user?.userId,
        nivel: req.user?.nivel
      };
      const result = await clientesService.notificarWhatsApp(req.params.id, filters);
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'NOTIFICATION_ERROR', message: error.message });
    }
  },

  async enviarEmailClientes(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      if (!empresaId) return res.status(400).json({ message: 'Usuário sem empresa' });

      const { cliente_ids, assunto, template } = req.body;
      if (!Array.isArray(cliente_ids) || cliente_ids.length === 0) {
        return res.status(400).json({ message: 'cliente_ids é obrigatório' });
      }
      if (!assunto || !template) {
        return res.status(400).json({ message: 'assunto e template são obrigatórios' });
      }

      // Buscar clientes com email
      const clientesResult = await query(
        `SELECT id, nome, email, telefone FROM clientes
         WHERE id = ANY($1::int[]) AND usuario_id IN (
           SELECT id FROM usuarios WHERE empresa_id = $2
         ) AND email IS NOT NULL AND email != ''`,
        [cliente_ids, empresaId]
      );
      const clientes = clientesResult.rows;

      if (clientes.length === 0) {
        return res.json({ enviados: 0, falhas: 0, semEmail: cliente_ids.length });
      }

      const smtp = await configuracoesSmtpService.getDecrypted(empresaId);

      function aplicarVariaveis(tpl: string, c: any) {
        const primeiroNome = c.nome?.split(' ')[0] || '';
        return tpl
          .replace(/\[Nome\]/gi, c.nome || '')
          .replace(/\[PrimeiroNome\]/gi, primeiroNome)
          .replace(/\[Email\]/gi, c.email || '')
          .replace(/\[Telefone\]/gi, c.telefone || '');
      }

      const resultados: { email: string; ok: boolean; erro?: string }[] = [];
      for (const cliente of clientes) {
        try {
          await enviarEmail(
            cliente.email,
            aplicarVariaveis(assunto, cliente),
            aplicarVariaveis(template, cliente),
            smtp ? {
              smtp_host: smtp.smtp_host,
              smtp_port: smtp.smtp_port,
              smtp_user: smtp.smtp_user,
              smtp_pass: smtp.smtp_pass!,
              email_from: smtp.email_from,
              email_from_name: smtp.email_from_name,
            } : undefined
          );
          resultados.push({ email: cliente.email, ok: true });
        } catch (err: any) {
          resultados.push({ email: cliente.email, ok: false, erro: err.message });
        }
      }

      const enviados = resultados.filter(r => r.ok).length;
      const falhas = resultados.filter(r => !r.ok).length;
      const semEmail = cliente_ids.length - clientes.length;

      return res.json({ enviados, falhas, semEmail, resultados });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }
};
