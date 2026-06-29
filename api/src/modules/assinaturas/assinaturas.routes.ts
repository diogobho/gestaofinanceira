import { Router } from 'express';
import { authRequired } from '../../middlewares/auth.middleware';
import { assinaturasController } from './assinaturas.controller';

const router = Router();

// Públicas
router.get('/planos', assinaturasController.listPlanos);
router.post('/webhook/asaas', assinaturasController.webhook);

// Autenticadas
router.get('/assinaturas/minha', authRequired, assinaturasController.getMinhaAssinatura);
router.get('/assinaturas/status', authRequired, assinaturasController.getStatus);
router.post('/assinaturas/assinar', authRequired, assinaturasController.assinar);
router.post('/assinaturas/cancelar', authRequired, assinaturasController.cancelar);
router.post('/assinaturas/:empresaId/ativar', authRequired, assinaturasController.ativarEmpresa);
router.post('/assinaturas/:empresaId/suspender', authRequired, assinaturasController.suspenderEmpresa);
router.post('/assinaturas/:empresaId/cancelar-admin', authRequired, assinaturasController.cancelarEmpresa);

export default router;
