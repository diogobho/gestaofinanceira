import { Request, Response } from 'express';
import { authService } from './auth.service';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { MSG_PEDIDO, conferirToken, pedirRedefinicao, redefinirSenha } from './redefinir-senha';

function ipDe(req: Request): string {
  // Respeita o proxy do nginx, como no aceite dos termos do cadastro.
  return ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || req.ip || '';
}

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
      const { nome, email, foto_perfil, assinatura_email } = req.body;
      const user = await authService.updatePerfil(req.user!.userId, { nome, email, foto_perfil, assinatura_email });
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

  /** Resposta sempre igual: a tela não pode servir para descobrir quem é cliente. */
  async esqueciSenha(req: Request, res: Response) {
    try {
      await pedirRedefinicao(req.body?.email, ipDe(req));
    } catch (error: any) {
      console.error('[senha] erro ao registrar pedido:', error?.message || error);
    }
    return res.json({ message: MSG_PEDIDO });
  },

  async conferirTokenSenha(req: Request, res: Response) {
    try {
      return res.json(await conferirToken(req.params.token));
    } catch (error: any) {
      return res.status(500).json({ code: 'TOKEN_CHECK_FAILED', message: 'Não foi possível conferir o link agora.' });
    }
  },

  async redefinirSenha(req: Request, res: Response) {
    try {
      await redefinirSenha(req.body?.token, req.body?.novaSenha);
      return res.json({ message: 'Senha criada. Já pode entrar com ela.' });
    } catch (error: any) {
      return res.status(400).json({ code: 'RESET_FAILED', message: error.message });
    }
  },

  async logout(req: Request, res: Response) {
    return res.json({ message: 'Logout realizado com sucesso' });
  },

  async registrar(req: Request, res: Response) {
    try {
      const { nome_empresa, nome_usuario, email, senha, plano_id, billing_type, cpf_cnpj, telefone, ciclo, aceite_termos, whatsapp_optin } = req.body;
      if (!nome_empresa || !nome_usuario || !email || !senha || !plano_id || !billing_type) {
        return res.status(400).json({ code: 'MISSING_FIELDS', message: 'Todos os campos são obrigatórios' });
      }
      // LGPD: aceite explícito dos Termos de Uso / Política de Privacidade é obrigatório.
      if (aceite_termos !== true && aceite_termos !== 'true') {
        return res.status(400).json({ code: 'TERMS_NOT_ACCEPTED', message: 'É necessário aceitar os Termos de Uso e a Política de Privacidade' });
      }
      // IP de origem para evidência do consentimento (respeita o proxy do nginx).
      const ip = ((req.headers['x-forwarded-for'] as string) || '').split(',')[0].trim() || req.ip || '';
      const result = await authService.registrar({
        nomeEmpresa: nome_empresa,
        nomeUsuario: nome_usuario,
        email,
        senha,
        planoId: Number(plano_id),
        billingType: billing_type,
        cpfCnpj: cpf_cnpj,
        telefone,
        ciclo: typeof ciclo === 'string' ? ciclo : undefined,
        // Opt-in do material por WhatsApp: só `true` explícito conta como
        // consentimento (LGPD) — qualquer outra coisa é "não pediu".
        optinWhatsapp: whatsapp_optin === true || whatsapp_optin === 'true',
        aceiteIp: ip,
      });
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({ code: 'REGISTER_FAILED', message: error.message });
    }
  },
};
