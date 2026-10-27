import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import * as onboarding from './onboarding.service';

/** Só `YYYY-MM-DD` que exista de verdade passa; o resto é ignorado, que é o
 *  mesmo que não filtrar. Query string é a parte mais fácil de alterar numa
 *  requisição — sanear antes do SQL não é opcional. */
function dataValida(v: any): string | undefined {
  const s = String(v || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? undefined : s;
}

export const onboardingController = {
  async getEnvios(req: AuthRequest, res: Response) {
    try {
      const { envios, resumo } = await onboarding.listarEnvios({
        dataInicio: dataValida(req.query.data_inicio),
        dataFim: dataValida(req.query.data_fim),
        planoId: Number(req.query.plano_id) || undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        busca: typeof req.query.busca === 'string' ? req.query.busca.trim() || undefined : undefined,
        limite: Number(req.query.limite) || undefined,
      });
      return res.json({ envios, resumo });
    } catch (err: any) {
      return res.status(500).json({ code: 'ONBOARDING_LIST_FAILED', message: err.message });
    }
  },

  async getMensagens(req: AuthRequest, res: Response) {
    try {
      return res.json(await onboarding.listarMensagens(Number(req.query.limite) || 50));
    } catch (err: any) {
      return res.status(500).json({ code: 'ONBOARDING_MSG_FAILED', message: err.message });
    }
  },

  async reenviarEmail(req: AuthRequest, res: Response) {
    try {
      const ok = await onboarding.enviarEmailDoEnvio(Number(req.params.id));
      // `enviarEmailDoEnvio` nunca lança: o motivo da falha fica gravado na
      // linha, e é de lá que a tela lê o texto do erro.
      return res.json({ success: ok });
    } catch (err: any) {
      return res.status(500).json({ code: 'ONBOARDING_REENVIO_FAILED', message: err.message });
    }
  },

  async enviarWhatsApp(req: AuthRequest, res: Response) {
    try {
      const desfecho = await onboarding.entregarMaterial(Number(req.params.id));
      return res.json({ success: desfecho === 'enviado', desfecho });
    } catch (err: any) {
      return res.status(500).json({ code: 'ONBOARDING_WA_FAILED', message: err.message });
    }
  },

  async getModelos(_req: AuthRequest, res: Response) {
    try {
      return res.json(await onboarding.listarModelos());
    } catch (err: any) {
      return res.status(500).json({ code: 'ONBOARDING_MODELOS_FAILED', message: err.message });
    }
  },

  async putModelo(req: AuthRequest, res: Response) {
    try {
      const { email_assunto, email_corpo, whatsapp_texto, pdf_arquivo } = req.body || {};
      // O PDF é lido de dentro de landing/onboarding/: sem esta trava, um
      // "../../../etc/passwd" viraria anexo de e-mail.
      if (pdf_arquivo !== undefined && !/^[A-Za-z0-9._-]+\.pdf$/.test(String(pdf_arquivo))) {
        return res.status(400).json({ code: 'PDF_INVALIDO', message: 'Informe só o nome do arquivo .pdf' });
      }
      const modelo = await onboarding.salvarModelo(
        Number(req.params.planoId),
        { email_assunto, email_corpo, whatsapp_texto, pdf_arquivo },
        req.user!.id
      );
      return res.json(modelo);
    } catch (err: any) {
      return res.status(400).json({ code: 'ONBOARDING_MODELO_SAVE_FAILED', message: err.message });
    }
  },

  async previa(req: AuthRequest, res: Response) {
    try {
      const { assunto, html, pdf } = await onboarding.montarEmail({
        nomeUsuario: req.body?.nome || 'Maria Silva',
        nomeEmpresa: req.body?.empresa || 'Clínica Saúde Total',
        planoId: Number(req.params.planoId),
        trial: req.body?.trial !== false,
      });
      return res.json({ assunto, html, anexo: pdf ? pdf.split('/').pop() : null });
    } catch (err: any) {
      return res.status(500).json({ code: 'ONBOARDING_PREVIA_FAILED', message: err.message });
    }
  },

  async teste(req: AuthRequest, res: Response) {
    try {
      const destino = String(req.body?.email || req.user?.email || '').trim();
      if (!destino) return res.status(400).json({ code: 'SEM_DESTINO', message: 'Informe o e-mail de destino' });
      const info = await onboarding.enviarTeste(
        Number(req.params.planoId),
        destino,
        String(req.body?.nome || '').trim() || 'Maria Silva',
        req.body?.trial !== false
      );
      return res.json({ success: true, messageId: info.messageId, to: destino });
    } catch (err: any) {
      return res.status(400).json({ code: 'ONBOARDING_TESTE_FAILED', message: err.message });
    }
  },
};

export default onboardingController;
