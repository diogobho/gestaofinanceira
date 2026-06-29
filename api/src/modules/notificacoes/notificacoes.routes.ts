import { Router } from 'express';
import { notificacoesController } from './notificacoes.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';

const router = Router();

// Aplicar autenticação em todas as rotas
router.use(authMiddleware);

// Rotas
router.get('/', notificacoesController.list);
router.get('/stats', notificacoesController.getStats);
router.get('/cliente/:clienteId', notificacoesController.getByCliente);
router.get('/:id', notificacoesController.getById);

export default router;
