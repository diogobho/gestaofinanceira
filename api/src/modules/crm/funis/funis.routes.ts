import { Router } from 'express';
import { funisController } from './funis.controller';
import { authRequired } from '../../../middlewares/auth.middleware';

const router = Router();

// Leitura: todos os usuários autenticados
router.get('/', funisController.list);
router.get('/default', funisController.getDefault);
router.get('/default-cx', funisController.getDefaultCX);
router.get('/:id', funisController.getById);
router.get('/:id/stats', funisController.getStats);

// Escrita: qualquer usuário autenticado com acesso ao CRM
router.post('/', authRequired, funisController.create);
router.put('/:id', authRequired, funisController.update);
router.delete('/:id', authRequired, funisController.delete);

export default router;
