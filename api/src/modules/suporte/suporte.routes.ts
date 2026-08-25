import { Router } from 'express';
import { authRequired } from '../../middlewares/auth.middleware';
import { suporteController } from './suporte.controller';

const router = Router();

router.get('/suporte/tickets', authRequired, suporteController.listar);
router.post('/suporte/tickets', authRequired, suporteController.criar);
router.get('/suporte/tickets/:id', authRequired, suporteController.detalhe);
router.post('/suporte/tickets/:id/mensagens', authRequired, suporteController.responder);
router.patch('/suporte/tickets/:id/status', authRequired, suporteController.alterarStatus);

export default router;
