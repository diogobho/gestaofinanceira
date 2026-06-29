import { Response } from 'express';
import { usuariosService } from './usuarios.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const usuariosController = {
  async list(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }
      const usuarios = await usuariosService.list(req.user);
      return res.json(usuarios);
    } catch (error: any) {
      return res.status(500).json({ code: 'LIST_ERROR', message: error.message });
    }
  },

  async listByEmpresa(req: AuthRequest, res: Response) {
    try {
      if (!req.user || !req.user.empresa_id) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }
      const usuarios = await usuariosService.listByEmpresa(req.user.empresa_id);
      return res.json(usuarios);
    } catch (error: any) {
      return res.status(500).json({ code: 'LIST_ERROR', message: error.message });
    }
  },

  async getById(req: AuthRequest, res: Response) {
    try {
      const usuario = await usuariosService.getById(req.params.id, req.user);
      return res.json(usuario);
    } catch (error: any) {
      const status = error.message.includes('permissão') ? 403 : 404;
      return res.status(status).json({ code: 'NOT_FOUND', message: error.message });
    }
  },

  async create(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }
      const usuario = await usuariosService.create(req.body, req.user);
      return res.status(201).json(usuario);
    } catch (error: any) {
      const status = error.message.includes('permissão') ? 403 : 400;
      return res.status(status).json({ code: 'CREATE_ERROR', message: error.message });
    }
  },

  async update(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }
      const usuario = await usuariosService.update(req.params.id, req.body, req.user);
      return res.json(usuario);
    } catch (error: any) {
      const status = error.message.includes('permissão') ? 403 : 400;
      return res.status(status).json({ code: 'UPDATE_ERROR', message: error.message });
    }
  },

  async updatePermissoes(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }
      const usuario = await usuariosService.updatePermissoes(req.params.id, req.body.permissoes, req.user);
      return res.json(usuario);
    } catch (error: any) {
      const status = error.message.includes('permissão') ? 403 : 400;
      return res.status(status).json({ code: 'UPDATE_ERROR', message: error.message });
    }
  },

  async delete(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }
      const result = await usuariosService.delete(req.params.id, req.user);
      return res.json(result);
    } catch (error: any) {
      const status = error.message.includes('permissão') ? 403 : 404;
      return res.status(status).json({ code: 'DELETE_ERROR', message: error.message });
    }
  },

  async listEmpresas(req: AuthRequest, res: Response) {
    try {
      // Apenas super_admin pode listar empresas
      if (!req.user || req.user.nivel !== 'super_admin') {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Acesso negado' });
      }
      const empresas = await usuariosService.listEmpresas();
      return res.json(empresas);
    } catch (error: any) {
      return res.status(500).json({ code: 'LIST_ERROR', message: error.message });
    }
  },

  async createEmpresa(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
      }
      const empresa = await usuariosService.createEmpresa(req.body.nome, req.user);
      return res.status(201).json(empresa);
    } catch (error: any) {
      const status = error.message.includes('permissão') || error.message.includes('Apenas') ? 403 : 400;
      return res.status(status).json({ code: 'CREATE_ERROR', message: error.message });
    }
  }
};
