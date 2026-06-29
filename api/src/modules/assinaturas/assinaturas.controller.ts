import { Request, Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { assinaturasService } from './assinaturas.service';

export const assinaturasController = {
  /** GET /planos — público */
  async listPlanos(req: Request, res: Response) {
    try {
      const planos = await assinaturasService.getPlanos();
      res.json({ planos });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  /** GET /assinaturas/minha — retorna assinatura da empresa do usuário */
  async getMinhaAssinatura(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      if (!empresaId) return res.status(400).json({ message: 'Usuário sem empresa' });

      let assinatura = await assinaturasService.getAssinaturaByEmpresa(empresaId);

      if (!assinatura) {
        await assinaturasService.criarTrialParaEmpresa(empresaId);
        assinatura = await assinaturasService.getAssinaturaByEmpresa(empresaId);
      }

      res.json({ assinatura });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  /** GET /assinaturas/status — verifica se acesso está liberado */
  async getStatus(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      if (!empresaId) return res.json({ ativa: true, status: 'super_admin' });

      const resultado = await assinaturasService.isAtiva(empresaId);
      res.json(resultado);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  /** POST /assinaturas/assinar — inicia assinatura */
  async assinar(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      if (!empresaId) return res.status(400).json({ message: 'Usuário sem empresa' });

      const { plano_id, billing_type, cpf_cnpj, credit_card, credit_card_holder_info } = req.body;

      if (!plano_id || !billing_type) {
        return res.status(400).json({ message: 'plano_id e billing_type são obrigatórios' });
      }

      // Buscar dados da empresa
      const { query } = await import('../../config/database');
      const empresaResult = await query('SELECT nome, email FROM empresas WHERE id = $1', [empresaId]);
      const empresa = empresaResult.rows[0];
      if (!empresa) return res.status(400).json({ message: 'Empresa não encontrada' });

      // remoteIp é obrigatório pelo Asaas para pagamentos com cartão de crédito
      const remoteIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress
        || req.ip
        || '127.0.0.1';

      const resultado = await assinaturasService.assinar({
        empresaId,
        planoId: Number(plano_id),
        billingType: billing_type,
        nomeEmpresa: empresa.nome,
        emailContato: empresa.email || req.user!.email,
        cpfCnpj: cpf_cnpj,
        creditCard: credit_card,
        creditCardHolderInfo: credit_card_holder_info,
        remoteIp,
      });

      res.json(resultado);
    } catch (error: any) {
      // Pass through Asaas validation errors (400) instead of always returning 500
      const asaasErrors = error.response?.data?.errors;
      if (asaasErrors?.length) {
        return res.status(400).json({ message: asaasErrors[0].description });
      }
      res.status(500).json({ message: error.message });
    }
  },

  /** POST /assinaturas/cancelar — cancela assinatura ativa */
  async cancelar(req: AuthRequest, res: Response) {
    try {
      const empresaId = req.user?.empresa_id;
      if (!empresaId) return res.status(400).json({ message: 'Usuário sem empresa' });

      await assinaturasService.cancelar(empresaId, req.body.motivo);
      res.json({ message: 'Assinatura cancelada com sucesso' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  /** POST /assinaturas/:empresaId/suspender — super_admin suspende empresa */
  async suspenderEmpresa(req: AuthRequest, res: Response) {
    try {
      if (req.user?.nivel !== 'super_admin') {
        return res.status(403).json({ message: 'Acesso negado' });
      }
      const empresaId = Number(req.params.empresaId);
      if (!empresaId) return res.status(400).json({ message: 'empresaId inválido' });
      await assinaturasService.suspender(empresaId, req.body.motivo);
      res.json({ message: 'Empresa suspensa com sucesso' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  /** POST /assinaturas/:empresaId/cancelar-admin — super_admin cancela empresa */
  async cancelarEmpresa(req: AuthRequest, res: Response) {
    try {
      if (req.user?.nivel !== 'super_admin') {
        return res.status(403).json({ message: 'Acesso negado' });
      }
      const empresaId = Number(req.params.empresaId);
      if (!empresaId) return res.status(400).json({ message: 'empresaId inválido' });
      await assinaturasService.cancelar(empresaId, req.body.motivo);
      res.json({ message: 'Empresa cancelada com sucesso' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  /** POST /assinaturas/:empresaId/ativar — super_admin ativa empresa indefinidamente */
  async ativarEmpresa(req: AuthRequest, res: Response) {
    try {
      if (req.user?.nivel !== 'super_admin') {
        return res.status(403).json({ message: 'Acesso negado' });
      }
      const empresaId = Number(req.params.empresaId);
      if (!empresaId) return res.status(400).json({ message: 'empresaId inválido' });
      await assinaturasService.ativarIndefinidamente(empresaId);
      res.json({ message: 'Empresa ativada indefinidamente com sucesso' });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  },

  /** POST /webhook/asaas — webhook público do Asaas */
  async webhook(req: Request, res: Response) {
    try {
      const { event, payment, subscription } = req.body;

      if (event && payment) {
        // Eventos de pagamento: PAYMENT_CONFIRMED, PAYMENT_OVERDUE, PAYMENT_RECEIVED, PAYMENT_DELETED
        await assinaturasService.processarWebhook(event, payment);
      } else if (event && subscription) {
        // Eventos de assinatura: SUBSCRIPTION_DELETED
        // O payload de subscription tem 'id' diretamente, adaptar para o formato do serviço
        await assinaturasService.processarWebhook(event, { subscription: subscription.id });
      }

      res.json({ received: true });
    } catch (error: any) {
      // Sempre retorna 200 para o Asaas não retentar
      console.error('[Asaas Webhook]', error.message);
      res.json({ received: true });
    }
  },
};
