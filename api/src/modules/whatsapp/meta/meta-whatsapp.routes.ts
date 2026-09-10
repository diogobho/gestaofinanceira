import { Router, Response, NextFunction } from 'express';
import { authRequired, AuthRequest } from '../../../middlewares/auth.middleware';
import controller from './meta-whatsapp.controller';
import { podeUsarCloudApi } from './acesso';

const router = Router();

// ── Público: a Meta chama o webhook sem JWT ──────────────────
router.get('/webhook', (req, res) => controller.verifyWebhook(req, res));
router.post('/webhook', (req, res) => controller.receiveWebhook(req, res));

/**
 * O restante mexe na conta Meta da DUOFUTURO — um único token de System User,
 * global ao processo, que não pertence a nenhuma empresa cliente. Por isso o
 * corte é `super_admin` (mais os revisores de `META_PAINEL_REVISORES`), e não
 * `masterOnly`: master existe em toda empresa do banco, e liberar por ele daria a
 * qualquer cliente o poder de enviar pelo nosso número oficial e de criar modelo
 * na nossa WABA.
 */
const acessoCloudApi = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
  }
  if (!podeUsarCloudApi(req.user)) {
    return res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Acesso restrito à administração da DuoFuturo.',
    });
  }
  next();
};

router.use(authRequired, acessoCloudApi);

router.get('/status', (req, res) => controller.getStatus(req, res));
router.post('/enviar', (req, res) => controller.enviarTexto(req, res));
router.get('/templates', (req, res) => controller.getTemplates(req, res));
router.post('/templates', (req, res) => controller.postTemplate(req, res));

export default router;
