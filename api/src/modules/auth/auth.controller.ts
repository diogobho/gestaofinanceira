import { Request, Response } from 'express';
import { authService } from './auth.service';
import { AuthRequest } from '../../middlewares/auth.middleware';

export const authController = {
  async login(req: Request, res: Response) {
    try {
      const { email, senha } = req.body;
      const result = await authService.login(email, senha);
      return res.json(result);
    } catch (error: any) {
      return res.status(401).json({ code: 'LOGIN_FAILED', message: error.message });
    }
  },

  async me(req: AuthRequest, res: Response) {
    try {
      const user = await authService.me(req.user!.userId);
      return res.json(user);
    } catch (error: any) {
      return res.status(404).json({ code: 'USER_NOT_FOUND', message: error.message });
    }
  },

  async updatePerfil(req: AuthRequest, res: Response) {
    try {
      const { nome, email, foto_perfil } = req.body;
      const user = await authService.updatePerfil(req.user!.userId, { nome, email, foto_perfil });
      return res.json(user);
    } catch (error: any) {
      return res.status(400).json({ code: 'UPDATE_PERFIL_ERROR', message: error.message });
    }
  },

  async updateSenha(req: AuthRequest, res: Response) {
    try {
      const { senhaAtual, novaSenha } = req.body;
      if (!senhaAtual || !novaSenha) {
        return res.status(400).json({ code: 'MISSING_FIELDS', message: 'senhaAtual e novaSenha são obrigatórios' });
      }
      await authService.updateSenha(req.user!.userId, senhaAtual, novaSenha);
      return res.json({ message: 'Senha alterada com sucesso' });
    } catch (error: any) {
      return res.status(400).json({ code: 'UPDATE_SENHA_ERROR', message: error.message });
    }
  },

  async logout(req: Request, res: Response) {
    return res.json({ message: 'Logout realizado com sucesso' });
  },

  async registrar(req: Request, res: Response) {
    try {
      const { nome_empresa, nome_usuario, email, senha, plano_id, billing_type, cpf_cnpj } = req.body;
      if (!nome_empresa || !nome_usuario || !email || !senha || !plano_id || !billing_type) {
        return res.status(400).json({ code: 'MISSING_FIELDS', message: 'Todos os campos são obrigatórios' });
      }
      const result = await authService.registrar({
        nomeEmpresa: nome_empresa,
        nomeUsuario: nome_usuario,
        email,
        senha,
        planoId: Number(plano_id),
        billingType: billing_type,
        cpfCnpj: cpf_cnpj,
      });
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'REGISTER_FAILED', message: error.message });
    }
  },
};
