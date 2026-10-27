import { Router, Response, NextFunction } from 'express';
import { authRequired, AuthRequest } from '../../../middlewares/auth.middleware';
import controller from './meta-whatsapp.controller';
import { podeUsarCloudApi } from './acesso';
import multer from 'multer';

// Foto do perfil: fica em memória e vai direto para a Meta, nada é gravado em disco.
const fotoPerfil = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

// Número oficial por empresa e perfil comercial — só super_admin (os revisores da
// Meta enxergam o painel, mas não ligam número em empresa nenhuma).
const soSuperAdmin = (req: AuthRequest, res: Response, next: NextFunction) =>
  req.user?.nivel === 'super_admin'
    ? next()
    : res.status(403).json({ code: 'FORBIDDEN', message: 'Só a administração da DuoFuturo mexe nisto.' });

router.get('/contas', soSuperAdmin, (req, res) => controller.getContas(req, res));
router.post('/contas', soSuperAdmin, (req, res) => controller.postConta(req, res));
router.post('/contas/:contaId/ligar', soSuperAdmin, (req, res) => controller.ligar(req, res));
router.post('/contas/:contaId/desligar', soSuperAdmin, (req, res) => controller.desligar(req, res));
router.get('/perfil', soSuperAdmin, (req, res) => controller.getPerfil(req, res));
router.put('/perfil', soSuperAdmin, (req, res) => controller.putPerfil(req, res));
router.post('/perfil/foto', soSuperAdmin, fotoPerfil.single('foto'), (req, res) => controller.postFotoPerfil(req, res));

export default router;
