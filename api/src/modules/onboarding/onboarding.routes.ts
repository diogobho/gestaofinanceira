import { Router, Response, NextFunction } from 'express';
import { authRequired, AuthRequest } from '../../middlewares/auth.middleware';
import controller from './onboarding.controller';

const router = Router();

/**
 * Tudo aqui é da DuoFuturo, não de uma empresa cliente: a lista de contas novas
 * atravessa todas as empresas do banco, e os modelos definem o que sai pelo
 * nosso número oficial e pelo nosso remetente. Por isso o corte é `super_admin`
 * — e não `masterOnly`, que existe em toda empresa do banco.
 *
 * Diferente do painel da Cloud API, aqui NÃO vale a exceção dos revisores da
 * Meta (`META_PAINEL_REVISORES`): estes dados são de clientes reais.
 */
const somenteDuoFuturo = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Usuário não autenticado' });
  }
  if (req.user.nivel !== 'super_admin') {
    return res.status(403).json({
      code: 'FORBIDDEN',
      message: 'Acesso restrito à administração da DuoFuturo.',
    });
  }
  next();
};

router.use(authRequired, somenteDuoFuturo);

router.get('/envios', (req, res) => controller.getEnvios(req, res));
router.get('/mensagens', (req, res) => controller.getMensagens(req, res));
router.post('/envios/:id/reenviar-email', (req, res) => controller.reenviarEmail(req, res));
router.post('/envios/:id/enviar-whatsapp', (req, res) => controller.enviarWhatsApp(req, res));

router.get('/modelos', (req, res) => controller.getModelos(req, res));
router.put('/modelos/:planoId', (req, res) => controller.putModelo(req, res));
router.post('/modelos/:planoId/previa', (req, res) => controller.previa(req, res));
router.post('/modelos/:planoId/teste', (req, res) => controller.teste(req, res));

export default router;
